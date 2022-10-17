"use strict";

const sourceMap = window.sourceMap;

sourceMap.SourceMapConsumer.initialize({ "lib/mappings.wasm": "mappings.wasm" });

var appElements = null;

const sourceMapURLs = new Map();
const sourceMapLoaded = new Map();

var isShowingOriginal = true;
var hasInput = false;

var dotsInterval = -1;
var dotsCounter = 1;

function hideDots() {
	if(dotsInterval !== -1) {
		clearInterval(dotsInterval);
		dotsInterval = -1;
	}
}

function sourceMapListLoaded(jsonFile) {
	var selector = appElements.sourceMaps;
	selector.disabled = false;
	while(selector.firstChild) {
		selector.removeChild(selector.firstChild);
	}
	const mapsList = jsonFile.sourceMaps;
	if(mapsList.length > 0) {
		var customOption = document.createElement("option");
		customOption.value = "_custom";
		customOption.appendChild(document.createTextNode("upload..."));
		selector.appendChild(customOption);
		for(var i = 0; i < mapsList.length; ++i) {
			var name = mapsList[i].name;
			sourceMapURLs.set(name, mapsList[i].url);
			var newOption = document.createElement("option");
			newOption.value = name;
			newOption.appendChild(document.createTextNode(name));
			selector.appendChild(newOption);
		}
		selector.value = mapsList[0].name;
	}
	hideDots();
	appElements.fetchingMessage.style.display = "none";
	appElements.inputTextArea.style.display = "block";
	appElements.outputTextArea.style.display = "none";
}

function sourceMapListError(err) {
	hideDots();
	appElements.fetchingMessage.style.color = "#FF7777";
	appElements.fetchingMessage.innerText = "Failed to load source map list!";
	console.error(err);
}

function updateDots() {
	appElements.loadingDots.innerText = ".".repeat(dotsCounter);
	dotsCounter = (dotsCounter + 1) % 4;
}

function extractVersionFromFile(lines) {
	for(var i = 0; i < lines.length; ++i) {
		var s = lines[i].trim();
		if(s.startsWith("eaglercraft.version") || s.startsWith("version")) {
			var v = s.split("=");
			if(v.length === 2) {
				var eq = v[1].trim();
				if(eq.startsWith("\"")) {
					eq = eq.substring(1);
				}
				if(eq.endsWith("\"")) {
					eq = eq.substring(0, eq.length - 1);
				}
				return eq;
			}
		}
	}
	return null;
}

var updateTimeout = -1;
var lastValue = "";
var hadPaste = false;

function textAreaInputHandler() {
	if(updateTimeout !== -1) {
		clearTimeout(updateTimeout);
	}
	setTimeout(() => {
		const oldValue = lastValue;
		var newLength = (lastValue = appElements.inputTextArea.value).trim().length;
		if(oldValue.trim().length == 0) {
			if(newLength > 0) {
				if(hadPaste) {
					hadPaste = false;
					var vers = extractVersionFromFile(lastValue.split(/\r?\n/g));
					if(vers !== null) {
						for(var k of sourceMapURLs.keys()) {
							if(vers === k) {
								appElements.sourceMaps.value = k;
								break;
							}
						}
					}
					setButton(true);
				}
			}
		}
		if(newLength > 0) {
			if(!hasInput) {
				appElements.showOriginal.style.display = "inline";
				appElements.showDecoded.style.display = "inline";
				hasInput = true;
			}
			appElements.showDecoded.classList.remove("toggleShowDisabled");
		}else {
			appElements.showDecoded.classList.add("toggleShowDisabled");
		}
	}, 300);
}

function textAreaPasteHandler() {
	textAreaInputHandler();
	hadPaste = true;
}

function clearDecodedView() {
	var cnt = appElements.outputContent;
	while(cnt.firstChild) {
		cnt.removeChild(cnt.firstChild);
	}
}

function showInfo(str, err) {
	clearDecodedView();
	var span = document.createElement("span");
	span.appendChild(document.createTextNode(str));
	span.style.fontSize = "20px";
	if(err) {
		span.style.color = "#FF9999";
	}
	appElements.outputContent.appendChild(span);
}

function highlightLine(line) {
	var e = document.createElement("span");
	e.style.color = "#FFFF77";
	e.appendChild(document.createTextNode(line));
	return e;
}

function formatLine(srcMapLine) {
	if(srcMapLine.line !== null) {
		if(srcMapLine.name === null) {
			return (srcMapLine.source === null ? "<anonymous>" : srcMapLine.source) + ":" +
				srcMapLine.line + (srcMapLine.column > 0 ? ":" + srcMapLine.column : "");
		}else {
			return "" + srcMapLine.name + " (" + (srcMapLine.source === null ? "<anonymous>" :
				srcMapLine.source) + ":" + srcMapLine.line + ":" + (srcMapLine.column > 0 ? ":" +
				srcMapLine.column : "") + ")";
		}
	}else {
		return null;
	}
}

function getIndent(line) {
	var ret = "";
	for(var i = 0; i < line.length; ++i) {
		var c = line.charAt(i);
		if(c === " " || c === "\t") {
			ret += c;
		}else {
			break;
		}
	}
	return ret;
}

function makeBold(str) {
	return "<span style=\"font-weight:bold;font-size:19px;\">" + str.replace("<", "&lt;").replace(">", "&gt;") + "</span>";
}

function printVersionWarning(vers) {
	const v = appElements.sourceMaps.value;
	if(sourceMapURLs.get(v) === "LOCAL") {
		return;
	}
	var str = null;
	if(!vers) {
		str = "WARNING: no game version (eaglercraft.version) is in this crash report!"
	}else {
		if(v !== vers) {
			str = "WARNING: this crash report seems to be from version '" + makeBold(vers) + "', but you have source map version '" + makeBold(v) + "' selected!";
		}
	}
	if(str !== null) {
		var e = document.createElement("span");
		e.style.color = "#FF7777";
		e.style.fontSize = "16px";
		e.innerHTML = str + "\n\nIf you don't select the correct source map version then the crash report will be incorrect\n\n";
		appElements.outputContent.appendChild(e);
	}
}

function updateSource(srcMap) {
	clearDecodedView();

	var firstLine = 0;
	var j = parseInt(appElements.firstLineValue.value);
	if(!isNaN(j) && j > 1 && appElements.enableFirstLine.checked) {
		firstLine = j - 1;
	}

	var sourceValue = appElements.inputTextArea.value;
	var lines = sourceValue.split(/\r?\n/g);
	var vers = extractVersionFromFile(lines);
	var hasShownWarning = false;
	for(var i = 0; i < lines.length; ++i) {
		var l = lines[i];

		if(l.indexOf("<anonymous>") === -1 && l.indexOf("eagswebrtc") === -1) {
			var split = l.split(":");

			if(split.length > 1) {
				var firstToken = split[0].toLowerCase();
				if(firstToken.endsWith("error")) {
					if(!hasShownWarning) {
						hasShownWarning = true;
						printVersionWarning(vers);
					}
					appElements.outputContent.appendChild(highlightLine(l + "\n"));
					continue;
				}else if(split.length > 2) {
					var lineTrim = split[split.length - 2].trim();
					var lineNo = parseInt(lineTrim);
					var colTrim = split[split.length - 1].trim();
					var colNo = parseInt(colTrim);
					if(isNaN(colNo)) {
						if(colTrim.length > 1) {
							colNo = parseInt(colTrim.substring(0, colTrim.length - 1));
						}
					}
					if(!isNaN(lineNo) && !isNaN(colNo)) {
						var newLineNumber = lineNo - firstLine;
						if(newLineNumber > 0) {
							var original = formatLine(srcMap.originalPositionFor({ line: newLineNumber, column: colNo }));
							if(original !== null) {
								if(firstToken.endsWith("line")) {
									appElements.outputContent.appendChild(document.createTextNode(lines[i] + " "));
									appElements.outputContent.appendChild(highlightLine(original + "\n"));
								}else {
									if(!hasShownWarning) {
										hasShownWarning = true;
										printVersionWarning(vers);
									}
									var idt = getIndent(split[0]);
									var realStart = split[0].substring(idt.length);
									if(realStart.startsWith("at")) {
										appElements.outputContent.appendChild(highlightLine(idt + "at " + original + "\n"));
									}else {
										appElements.outputContent.appendChild(highlightLine(idt + original + "\n"));
									}
								}
								continue;
							}
						}
					}
				}
			}
		}

		appElements.outputContent.appendChild(document.createTextNode(lines[i] + "\n"));
	}
}

function tryUpdateSource(srcMap) {
	sourceMap.SourceMapConsumer.with(srcMap, null, (srcMapObject) => {
		try {
			updateSource(srcMapObject);
		}catch(e) {
			isUpdating = false;
			showInfo("Parse error, check devtools", true);
			console.error(e);
		}
	}).catch((e) => {
		isUpdating = false;
		showInfo("Source map load error, check devtools", true);
		console.error(e);
	});
}

var isUpdating = false;

function updateDecodedPane() {
	if(!isUpdating) {
		const v = appElements.sourceMaps.value;
		if(v !== "_custom") {
			var mapJSON = sourceMapLoaded.get(v);

			if(mapJSON) {
				try {
					showInfo("Processing source...");
					tryUpdateSource(mapJSON);
					return;
				}catch(e) {
					isUpdating = false;
					console.error(e);
					showInfo("Internal error, check devtools", true);
				}
			}

			var mapURL = sourceMapURLs.get(v);

			if(!mapURL) {
				showInfo("Unknown source map: " + v, true);
				isUpdating = false;
				return;
			}

			showInfo("Loading source map " + v + "...");

			fetch(mapURL)
				.then((r) => r.json()).then((j) => {
					sourceMapLoaded.set(v, j);
					try {
						showInfo("Processing source...");
						tryUpdateSource(j);
					}catch(e) {
						isUpdating = false;
						showInfo("Internal error, check devtools", true);
					}
				}).catch((e) => {
					isUpdating = false;
					showInfo("Could not load source map: " + v, true);
				});
		}else {
			clearDecodedView();
			showFileChooser();
		}
	}
}

function setButton(decodedOrOriginal) {
	if(decodedOrOriginal) {
		if(isShowingOriginal) {
			isShowingOriginal = false;
			appElements.showDecoded.classList.add("toggleSelected");
			appElements.showOriginal.classList.remove("toggleSelected");
			appElements.inputTextArea.style.display = "none";
			appElements.outputTextArea.style.display = "block";
			updateDecodedPane();
		}
	}else {
		if(!isShowingOriginal) {
			isShowingOriginal = true;
			appElements.showDecoded.classList.remove("toggleSelected");
			appElements.showOriginal.classList.add("toggleSelected");
			appElements.inputTextArea.style.display = "block";
			appElements.outputTextArea.style.display = "none";
		}
	}
}

function comboBoxChangeHandler() {
	if(!isShowingOriginal) {
		updateDecodedPane();
	}
}

function showFileChooser() {
	const fileChooserElement = document.createElement("input");

	fileChooserElement.type = "file";
	fileChooserElement.accept = ".json,.map";

	fileChooserElement.addEventListener("change", () => {
		const files = fileChooserElement.files;
		if(files.length > 0) {
			var phile = files[0];
			var name = phile.name.trim();
			if(name.endsWith(".json")) {
				name = name.substring(0, name.length - 5).trim();
			}
			if(name.length > 0) {
				if(name === "_custom") {
					name = "__custom";
				}
				var name2 = name;
				var i = 0;
				while(sourceMapURLs.has(name2)) {
					name2 = name + " (" + (++i) + ")"; 
				}
				const namec = name2;
				const reader = new FileReader();
				reader.addEventListener("load", () => {
					try {
						var jsonObj = JSON.parse(reader.result);
						if(jsonObj) {
							sourceMapURLs.set(namec, "LOCAL");
							sourceMapLoaded.set(namec, jsonObj);
							var newOption = document.createElement("option");
							newOption.value = namec;
							newOption.appendChild(document.createTextNode(namec));
							const selector = appElements.sourceMaps;
							if(selector.childNodes.length > 1) {
								selector.insertBefore(newOption, selector.childNodes[1]);
							}else {
								selector.appendChild(newOption);
							}
							selector.value = namec;
							if(!isShowingOriginal) {
								updateDecodedPane();
							}
						}
					}catch(e) {
						console.log(e);
						alert("Not a valid JSON source map!");
					}
				});
				reader.readAsText(phile);
			}
		}
	});

	fileChooserElement.click();
}

function changeFirstLineShading(en) {
	if(en) {
		appElements.firstLineText.style.color = "white";
		appElements.firstLineValue.disabled = false;
	}else {
		appElements.firstLineText.style.color = "#999999";
		appElements.firstLineValue.disabled = true;
	}
}

var changeFirstLineTimout = -1;

function handleChangeFirstLineEnabled() {
	changeFirstLineTimout = -1;
	var cookie = {};
	cookie.enableFirstLine = appElements.enableFirstLine.checked;
	var i = parseInt(appElements.firstLineValue.value);
	var is_nan = isNaN(i);
	if(!is_nan || cookie.enableFirstLine) {
		if(is_nan || i < 1) {
			i = 1;
		}
		cookie.firstLineValue = i;
		window.localStorage.setItem("crashReportViewer_conf", JSON.stringify(cookie));
	}
	changeFirstLineShading(cookie.enableFirstLine);
	if(!isShowingOriginal) {
		updateDecodedPane();
	}
}

function changeFirstLineEnabled() {
	if(changeFirstLineTimout != -1) {
		clearTimeout(changeFirstLineTimout);
	}
	changeFirstLineTimout = setTimeout(handleChangeFirstLineEnabled, 300);
}

function changeFirstLineEnabledImmediate() {
	if(changeFirstLineTimout != -1) {
		clearTimeout(changeFirstLineTimout);
	}
	var i = parseInt(appElements.firstLineValue.value);
	var is_nan = isNaN(i);
	if(is_nan || i < 1) {
		appElements.firstLineValue.value = "1";
	}
	handleChangeFirstLineEnabled();
}

window.addEventListener("load", () => {

	appElements = {
		showOriginal: document.getElementById("showOriginal"),
		showDecoded: document.getElementById("showDecoded"),
		sourceMaps: document.getElementById("sourceMaps"),
		inputTextArea: document.getElementById("inputTextArea"),
		outputTextArea: document.getElementById("outputTextArea"),
		outputContent: document.getElementById("outputContent"),
		fetchingMessage: document.getElementById("fetchingMessage"),
		loadingDots: document.getElementById("loadingDots"),
		enableFirstLine: document.getElementById("enableFirstLine"),
		firstLineText: document.getElementById("firstLineText"),
		firstLineValue: document.getElementById("firstLineValue")
	};

	dotsInterval = setInterval(updateDots, 300);

	appElements.showOriginal.addEventListener("click", () => setButton(false));

	appElements.showDecoded.addEventListener("click", () => {
		if(appElements.inputTextArea.value.trim().length > 0) {
			setButton(true);
		}
	});

	appElements.inputTextArea.addEventListener("propertychange", textAreaInputHandler);
	appElements.inputTextArea.addEventListener("change", textAreaInputHandler);
	appElements.inputTextArea.addEventListener("click", textAreaInputHandler);
	appElements.inputTextArea.addEventListener("keyup", textAreaInputHandler);
	appElements.inputTextArea.addEventListener("input", textAreaInputHandler);
	appElements.inputTextArea.addEventListener("paste", textAreaPasteHandler);

	appElements.sourceMaps.addEventListener("change", comboBoxChangeHandler);

	appElements.enableFirstLine.addEventListener("change", changeFirstLineEnabledImmediate);
	appElements.firstLineValue.addEventListener("propertychange", changeFirstLineEnabled);
	appElements.firstLineValue.addEventListener("change", changeFirstLineEnabled);
	appElements.firstLineValue.addEventListener("click", changeFirstLineEnabled);
	appElements.firstLineValue.addEventListener("keyup", changeFirstLineEnabled);
	appElements.firstLineValue.addEventListener("input", changeFirstLineEnabled);
	appElements.firstLineValue.addEventListener("paste", changeFirstLineEnabled);

	var cookie = window.localStorage.getItem("crashReportViewer_conf");
	if(cookie) {
		try {
			cookie = JSON.parse(cookie);
			if(cookie && typeof cookie.firstLineValue === "number") {
				appElements.enableFirstLine.checked = !!cookie.enableFirstLine;
				appElements.firstLineValue.value = "" + cookie.firstLineValue;
				changeFirstLineShading(!!cookie.enableFirstLine);
			}
		}catch(e) {
		}
	}

	fetch("sourceMaps.json")
		.then((r) => r.json())
		.then(sourceMapListLoaded)
		.catch(sourceMapListError);

});
