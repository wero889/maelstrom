// Generated by CoffeeScript 1.3.3
(function() {
  var BackgroundCommands, checkKeyQueue, completers, completionSources, copyToClipboard, currentVersion, fetchFileContents, filterCompleter, focusedFrame, framesForTab, generateCompletionKeys, getActualKeyStrokeLength, getCompletionKeysRequest, getCurrFrameIndex, getCurrentTabUrl, getCurrentTimeInSeconds, handleFrameFocused, handleKeyDown, handleSettings, handleUpdateScrollPosition, helpDialogHtmlForCommandGroup, isEnabledForUrl, keyQueue, namedKeyRegex, openOptionsPageInNewTab, openUrlInCurrentTab, openUrlInIncognito, openUrlInNewTab, populateSingleKeyCommands, populateValidFirstKeys, portHandlers, refreshCompleter, registerFrame, repeatFunction, root, saveHelpDialogSettings, selectSpecificTab, selectTab, selectionChangedHandlers, sendRequestHandlers, sendRequestToAllTabs, shouldShowUpgradeMessage, singleKeyCommands, splitKeyIntoFirstAndSecond, splitKeyQueue, tabInfoMap, tabLoadedHandlers, tabQueue, updateActiveState, updateOpenTabs, updatePositionsAndWindowsForAllTabsInWindow, updateScrollPosition, upgradeNotificationClosed, validFirstKeys, whitespaceRegexp;

  root = typeof exports !== "undefined" && exports !== null ? exports : window;

  currentVersion = Utils.getCurrentVersion();

  tabQueue = {};

  tabInfoMap = {};

  keyQueue = "";

  validFirstKeys = {};

  singleKeyCommands = [];

  focusedFrame = null;

  framesForTab = {};

  namedKeyRegex = /^(<(?:[amc]-.|(?:[amc]-)?[a-z0-9]{2,5})>)(.*)$/;

  selectionChangedHandlers = [];

  tabLoadedHandlers = {};

  completionSources = {
    bookmarks: new BookmarkCompleter(),
    history: new HistoryCompleter(),
    domains: new DomainCompleter(),
    tabs: new TabCompleter()
  };

  completers = {
    omni: new MultiCompleter([completionSources.bookmarks, completionSources.history, completionSources.domains]),
    bookmarks: new MultiCompleter([completionSources.bookmarks]),
    tabs: new MultiCompleter([completionSources.tabs])
  };

  chrome.runtime.onConnect.addListener(function(port, name) {
    var senderTabId, toCall;
    senderTabId = port.sender.tab ? port.sender.tab.id : null;
    if (port.name === "domReady" && senderTabId !== null) {
      if (tabLoadedHandlers[senderTabId]) {
        toCall = tabLoadedHandlers[senderTabId];
        delete tabLoadedHandlers[senderTabId];
        toCall.call();
      }
      if (shouldShowUpgradeMessage()) {
        chrome.tabs.sendMessage(senderTabId, {
          name: "showUpgradeNotification",
          version: currentVersion
        });
      }
    }
    if (portHandlers[port.name]) {
      return port.onMessage.addListener(portHandlers[port.name]);
    }
  });

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (sendRequestHandlers[request.handler]) {
      sendResponse(sendRequestHandlers[request.handler](request, sender));
    }
    return false;
  });

  getCurrentTabUrl = function(request, sender) {
    return sender.tab.url;
  };

  isEnabledForUrl = function(request) {
    var excludedUrls, isEnabled, regexp, url, _i, _len;
    excludedUrls = Settings.get("excludedUrls").split("\n");
    isEnabled = true;
    for (_i = 0, _len = excludedUrls.length; _i < _len; _i++) {
      url = excludedUrls[_i];
      regexp = new RegExp("^" + url.replace(/\*/g, ".*") + "$");
      if (request.url.match(regexp)) {
        isEnabled = false;
      }
    }
    return {
      isEnabledForUrl: isEnabled
    };
  };

  root.addExcludedUrl = function(url) {
    var excludedUrls;
    if (!(url = url.trim())) {
      return;
    }
    excludedUrls = Settings.get("excludedUrls");
    if (excludedUrls.indexOf(url) >= 0) {
      return;
    }
    excludedUrls += "\n" + url;
    Settings.set("excludedUrls", excludedUrls);
    return chrome.tabs.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
      active: true
    }, function(tabs) {
      return updateActiveState(tabs[0].id);
    });
  };

  saveHelpDialogSettings = function(request) {
    return Settings.set("helpDialog_showAdvancedCommands", request.showAdvancedCommands);
  };

  root.helpDialogHtml = function(showUnboundCommands, showCommandNames, customTitle) {
    var command, commandsToKey, dialogHtml, group, key;
    commandsToKey = {};
    for (key in Commands.keyToCommandRegistry) {
      command = Commands.keyToCommandRegistry[key].command;
      commandsToKey[command] = (commandsToKey[command] || []).concat(key);
    }
    dialogHtml = fetchFileContents("pages/help_dialog.html");
    for (group in Commands.commandGroups) {
      dialogHtml = dialogHtml.replace("{{" + group + "}}", helpDialogHtmlForCommandGroup(group, commandsToKey, Commands.availableCommands, showUnboundCommands, showCommandNames));
    }
    dialogHtml = dialogHtml.replace("{{version}}", currentVersion);
    dialogHtml = dialogHtml.replace("{{title}}", customTitle || "Help");
    return dialogHtml;
  };

  helpDialogHtmlForCommandGroup = function(group, commandsToKey, availableCommands, showUnboundCommands, showCommandNames) {
    var bindings, command, html, isAdvanced, _i, _len, _ref;
    html = [];
    _ref = Commands.commandGroups[group];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      command = _ref[_i];
      bindings = (commandsToKey[command] || [""]).join(", ");
      if (showUnboundCommands || commandsToKey[command]) {
        isAdvanced = Commands.advancedCommands.indexOf(command) >= 0;
        html.push("<tr class='vimiumReset " + (isAdvanced ? "advanced" : void 0) + "'>", "<td class='vimiumReset'>", Utils.escapeHtml(bindings), "</td>", "<td class='vimiumReset'>:</td><td class='vimiumReset'>", availableCommands[command].description);
        if (showCommandNames) {
          html.push("<span class='vimiumReset commandName'>(" + command + ")</span>");
        }
        html.push("</td></tr>");
      }
    }
    return html.join("\n");
  };

  fetchFileContents = function(extensionFileName) {
    var req;
    req = new XMLHttpRequest();
    req.open("GET", chrome.runtime.getURL(extensionFileName), false);
    req.send();
    return req.responseText;
  };

  getCompletionKeysRequest = function(request, keysToCheck) {
    if (keysToCheck == null) {
      keysToCheck = "";
    }
    return {
      name: "refreshCompletionKeys",
      completionKeys: generateCompletionKeys(keysToCheck),
      validFirstKeys: validFirstKeys
    };
  };

  openUrlInCurrentTab = function(request) {
    return chrome.tabs.getSelected(null, function(tab) {
      return chrome.tabs.update(tab.id, {
        url: Utils.convertToUrl(request.url)
      });
    });
  };

  openUrlInNewTab = function(request) {
    return chrome.tabs.getSelected(null, function(tab) {
      return chrome.tabs.create({
        url: Utils.convertToUrl(request.url),
        index: tab.index + 1,
        selected: true
      });
    });
  };

  openUrlInIncognito = function(request) {
    return chrome.windows.create({
      url: Utils.convertToUrl(request.url),
      incognito: true
    });
  };

  upgradeNotificationClosed = function(request) {
    Settings.set("previousVersion", currentVersion);
    return sendRequestToAllTabs({
      name: "hideUpgradeNotification"
    });
  };

  copyToClipboard = function(request) {
    return Clipboard.copy(request.data);
  };

  selectSpecificTab = function(request) {
    return chrome.tabs.get(request.id, function(tab) {
      chrome.windows.update(tab.windowId, {
        focused: true
      });
      return chrome.tabs.update(request.id, {
        selected: true
      });
    });
  };

  handleSettings = function(args, port) {
    var value;
    if (args.operation === "get") {
      value = Settings.get(args.key);
      return port.postMessage({
        key: args.key,
        value: value
      });
    } else {
      return Settings.set(args.key, args.value);
    }
  };

  refreshCompleter = function(request) {
    return completers[request.name].refresh();
  };

  whitespaceRegexp = /\s+/;

  filterCompleter = function(args, port) {
    var queryTerms;
    queryTerms = args.query === "" ? [] : args.query.split(whitespaceRegexp);
    return completers[args.name].filter(queryTerms, function(results) {
      return port.postMessage({
        id: args.id,
        results: results
      });
    });
  };

  getCurrentTimeInSeconds = function() {
    return Math.floor((new Date()).getTime() / 1000);
  };

  chrome.tabs.onSelectionChanged.addListener(function(tabId, selectionInfo) {
    if (selectionChangedHandlers.length > 0) {
      return selectionChangedHandlers.pop().call();
    }
  });

  repeatFunction = function(func, totalCount, currentCount, frameId) {
    if (currentCount < totalCount) {
      return func(function() {
        return repeatFunction(func, totalCount, currentCount + 1, frameId);
      }, frameId);
    }
  };

  BackgroundCommands = {
    createTab: function(callback) {
      return chrome.tabs.create({
        url: "chrome://newtab"
      }, function(tab) {
        return callback();
      });
    },
    duplicateTab: function(callback) {
      return chrome.tabs.getSelected(null, function(tab) {
        chrome.tabs.duplicate(tab.id);
        return selectionChangedHandlers.push(callback);
      });
    },
    moveTabToNewWindow: function(callback) {
      return chrome.tabs.getSelected(null, function(tab) {
        return chrome.windows.create({
          tabId: tab.id
        });
      });
    },
    nextTab: function(callback) {
      return selectTab(callback, "next");
    },
    previousTab: function(callback) {
      return selectTab(callback, "previous");
    },
    firstTab: function(callback) {
      return selectTab(callback, "first");
    },
    lastTab: function(callback) {
      return selectTab(callback, "last");
    },
    removeTab: function() {
      return chrome.tabs.getSelected(null, function(tab) {
        return chrome.tabs.remove(tab.id);
      });
    },
    restoreTab: function(callback) {
      return chrome.windows.getCurrent(function(window) {
        var tabQueueEntry;
        if (!(tabQueue[window.id] && tabQueue[window.id].length > 0)) {
          return;
        }
        tabQueueEntry = tabQueue[window.id].pop();
        if (tabQueue[window.id].length === 0) {
          delete tabQueue[window.id];
        }
        return chrome.tabs.create({
          url: tabQueueEntry.url,
          index: tabQueueEntry.positionIndex
        }, function(tab) {
          tabLoadedHandlers[tab.id] = function() {
            return chrome.tabs.sendMessage(tab.id, {
              name: "setScrollPosition",
              scrollX: tabQueueEntry.scrollX,
              scrollY: tabQueueEntry.scrollY
            });
          };
          return callback();
        });
      });
    },
    openCopiedUrlInCurrentTab: function(request) {
      return openUrlInCurrentTab({
        url: Clipboard.paste()
      });
    },
    openCopiedUrlInNewTab: function(request) {
      return openUrlInNewTab({
        url: Clipboard.paste()
      });
    },
    showHelp: function(callback, frameId) {
      return chrome.tabs.getSelected(null, function(tab) {
        return chrome.tabs.sendMessage(tab.id, {
          name: "toggleHelpDialog",
          dialogHtml: helpDialogHtml(),
          frameId: frameId
        });
      });
    },
    nextFrame: function(count) {
      return chrome.tabs.getSelected(null, function(tab) {
        var currIndex, frames, newIndex;
        frames = framesForTab[tab.id].frames;
        currIndex = getCurrFrameIndex(frames);
        newIndex = (currIndex + count) % frames.length;
        return chrome.tabs.sendMessage(tab.id, {
          name: "focusFrame",
          frameId: frames[newIndex].id,
          highlight: true
        });
      });
    }
  };

  selectTab = function(callback, direction) {
    return chrome.tabs.getAllInWindow(null, function(tabs) {
      if (!(tabs.length > 1)) {
        return;
      }
      return chrome.tabs.getSelected(null, function(currentTab) {
        var toSelect;
        switch (direction) {
          case "next":
            toSelect = tabs[(currentTab.index + 1 + tabs.length) % tabs.length];
            break;
          case "previous":
            toSelect = tabs[(currentTab.index - 1 + tabs.length) % tabs.length];
            break;
          case "first":
            toSelect = tabs[0];
            break;
          case "last":
            toSelect = tabs[tabs.length - 1];
        }
        selectionChangedHandlers.push(callback);
        return chrome.tabs.update(toSelect.id, {
          selected: true
        });
      });
    });
  };

  updateOpenTabs = function(tab) {
    var _ref;
    if ((_ref = tabInfoMap[tab.id]) != null ? _ref.deletor : void 0) {
      clearTimeout(tabInfoMap[tab.id].deletor);
    }
    tabInfoMap[tab.id] = {
      url: tab.url,
      positionIndex: tab.index,
      windowId: tab.windowId,
      scrollX: null,
      scrollY: null,
      deletor: null
    };
    return delete framesForTab[tab.id];
  };

  updateActiveState = function(tabId) {
    var disabledIcon, enabledIcon;
    enabledIcon = "icons/browser_action_enabled.png";
    disabledIcon = "icons/browser_action_disabled.png";
    return chrome.tabs.get(tabId, function(tab) {
      chrome.browserAction.setIcon({
        path: disabledIcon
      });
      return chrome.tabs.sendMessage(tabId, {
        name: "getActiveState"
      }, function(response) {
        var isCurrentlyEnabled, shouldBeEnabled;
        isCurrentlyEnabled = (response != null) && response.enabled;
        shouldBeEnabled = isEnabledForUrl({
          url: tab.url
        }).isEnabledForUrl;
        if (isCurrentlyEnabled) {
          if (shouldBeEnabled) {
            return chrome.browserAction.setIcon({
              path: enabledIcon
            });
          } else {
            chrome.browserAction.setIcon({
              path: disabledIcon
            });
            return chrome.tabs.sendMessage(tabId, {
              name: "disableVimium"
            });
          }
        } else {
          return chrome.browserAction.setIcon({
            path: disabledIcon
          });
        }
      });
    });
  };

  handleUpdateScrollPosition = function(request, sender) {
    return updateScrollPosition(sender.tab, request.scrollX, request.scrollY);
  };

  updateScrollPosition = function(tab, scrollX, scrollY) {
    tabInfoMap[tab.id].scrollX = scrollX;
    return tabInfoMap[tab.id].scrollY = scrollY;
  };

  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    if (changeInfo.status !== "loading") {
      return;
    }
    chrome.tabs.insertCSS(tabId, {
      allFrames: true,
      code: Settings.get("userDefinedLinkHintCss"),
      runAt: "document_start"
    });
    updateOpenTabs(tab);
    return updateActiveState(tabId);
  });

  chrome.tabs.onAttached.addListener(function(tabId, attachedInfo) {
    if (tabInfoMap[tabId]) {
      updatePositionsAndWindowsForAllTabsInWindow(tabInfoMap[tabId].windowId);
    }
    return updatePositionsAndWindowsForAllTabsInWindow(attachedInfo.newWindowId);
  });

  chrome.tabs.onMoved.addListener(function(tabId, moveInfo) {
    return updatePositionsAndWindowsForAllTabsInWindow(moveInfo.windowId);
  });

  chrome.tabs.onRemoved.addListener(function(tabId) {
    var i, openTabInfo;
    openTabInfo = tabInfoMap[tabId];
    updatePositionsAndWindowsForAllTabsInWindow(openTabInfo.windowId);
    if (/^(chrome|view-source:)[^:]*:\/\/.*/.test(openTabInfo.url)) {
      for (i in tabQueue[openTabInfo.windowId]) {
        if (tabQueue[openTabInfo.windowId][i].positionIndex > openTabInfo.positionIndex) {
          tabQueue[openTabInfo.windowId][i].positionIndex--;
        }
      }
      return;
    }
    if (tabQueue[openTabInfo.windowId]) {
      tabQueue[openTabInfo.windowId].push(openTabInfo);
    } else {
      tabQueue[openTabInfo.windowId] = [openTabInfo];
    }
    tabInfoMap.deletor = function() {
      return delete tabInfoMap[tabId];
    };
    setTimeout(tabInfoMap.deletor, 1000);
    return delete framesForTab[tabId];
  });

  chrome.tabs.onActiveChanged.addListener(function(tabId, selectInfo) {
    return updateActiveState(tabId);
  });

  chrome.windows.onRemoved.addListener(function(windowId) {
    return delete tabQueue[windowId];
  });

  updatePositionsAndWindowsForAllTabsInWindow = function(windowId) {
    return chrome.tabs.getAllInWindow(windowId, function(tabs) {
      var openTabInfo, tab, _i, _len, _results;
      _results = [];
      for (_i = 0, _len = tabs.length; _i < _len; _i++) {
        tab = tabs[_i];
        openTabInfo = tabInfoMap[tab.id];
        if (openTabInfo) {
          openTabInfo.positionIndex = tab.index;
          _results.push(openTabInfo.windowId = tab.windowId);
        } else {
          _results.push(void 0);
        }
      }
      return _results;
    });
  };

  splitKeyIntoFirstAndSecond = function(key) {
    if (key.search(namedKeyRegex) === 0) {
      return {
        first: RegExp.$1,
        second: RegExp.$2
      };
    } else {
      return {
        first: key[0],
        second: key.slice(1)
      };
    }
  };

  getActualKeyStrokeLength = function(key) {
    if (key.search(namedKeyRegex) === 0) {
      return 1 + getActualKeyStrokeLength(RegExp.$2);
    } else {
      return key.length;
    }
  };

  populateValidFirstKeys = function() {
    var key, _results;
    _results = [];
    for (key in Commands.keyToCommandRegistry) {
      if (getActualKeyStrokeLength(key) === 2) {
        _results.push(validFirstKeys[splitKeyIntoFirstAndSecond(key).first] = true);
      } else {
        _results.push(void 0);
      }
    }
    return _results;
  };

  populateSingleKeyCommands = function() {
    var key, _results;
    _results = [];
    for (key in Commands.keyToCommandRegistry) {
      if (getActualKeyStrokeLength(key) === 1) {
        _results.push(singleKeyCommands.push(key));
      } else {
        _results.push(void 0);
      }
    }
    return _results;
  };

  root.refreshCompletionKeysAfterMappingSave = function() {
    validFirstKeys = {};
    singleKeyCommands = [];
    populateValidFirstKeys();
    populateSingleKeyCommands();
    return sendRequestToAllTabs(getCompletionKeysRequest());
  };

  generateCompletionKeys = function(keysToCheck) {
    var command, completionKeys, count, key, splitHash, splitKey;
    splitHash = splitKeyQueue(keysToCheck || keyQueue);
    command = splitHash.command;
    count = splitHash.count;
    completionKeys = singleKeyCommands.slice(0);
    if (getActualKeyStrokeLength(command) === 1) {
      for (key in Commands.keyToCommandRegistry) {
        splitKey = splitKeyIntoFirstAndSecond(key);
        if (splitKey.first === command) {
          completionKeys.push(splitKey.second);
        }
      }
    }
    return completionKeys;
  };

  splitKeyQueue = function(queue) {
    var command, count, match;
    match = /([1-9][0-9]*)?(.*)/.exec(queue);
    count = parseInt(match[1], 10);
    command = match[2];
    return {
      count: count,
      command: command
    };
  };

  handleKeyDown = function(request, port) {
    var key;
    key = request.keyChar;
    if (key === "<ESC>") {
      console.log("clearing keyQueue");
      return keyQueue = "";
    } else {
      console.log("checking keyQueue: [", keyQueue + key, "]");
      keyQueue = checkKeyQueue(keyQueue + key, port.sender.tab.id, request.frameId);
      return console.log("new KeyQueue: " + keyQueue);
    }
  };

  checkKeyQueue = function(keysToCheck, tabId, frameId) {
    var command, count, newKeyQueue, refreshedCompletionKeys, registryEntry, splitHash, splitKey;
    refreshedCompletionKeys = false;
    splitHash = splitKeyQueue(keysToCheck);
    command = splitHash.command;
    count = splitHash.count;
    if (command.length === 0) {
      return keysToCheck;
    }
    if (isNaN(count)) {
      count = 1;
    }
    if (Commands.keyToCommandRegistry[command]) {
      registryEntry = Commands.keyToCommandRegistry[command];
      if (!registryEntry.isBackgroundCommand) {
        chrome.tabs.sendMessage(tabId, {
          name: "executePageCommand",
          command: registryEntry.command,
          frameId: frameId,
          count: count,
          passCountToFunction: registryEntry.passCountToFunction,
          completionKeys: generateCompletionKeys("")
        });
        refreshedCompletionKeys = true;
      } else {
        if (registryEntry.passCountToFunction) {
          BackgroundCommands[registryEntry.command](count);
        } else if (registryEntry.noRepeat) {
          BackgroundCommands[registryEntry.command]();
        } else {
          repeatFunction(BackgroundCommands[registryEntry.command], count, 0, frameId);
        }
      }
      newKeyQueue = "";
    } else if (getActualKeyStrokeLength(command) > 1) {
      splitKey = splitKeyIntoFirstAndSecond(command);
      if (Commands.keyToCommandRegistry[splitKey.second]) {
        newKeyQueue = checkKeyQueue(splitKey.second, tabId, frameId);
      } else {
        newKeyQueue = (validFirstKeys[splitKey.second] ? splitKey.second : "");
      }
    } else {
      newKeyQueue = (validFirstKeys[command] ? count.toString() + command : "");
    }
    if (!refreshedCompletionKeys) {
      chrome.tabs.sendMessage(tabId, getCompletionKeysRequest(null, newKeyQueue), null);
    }
    return newKeyQueue;
  };

  sendRequestToAllTabs = function(args) {
    return chrome.windows.getAll({
      populate: true
    }, function(windows) {
      var tab, window, _i, _len, _results;
      _results = [];
      for (_i = 0, _len = windows.length; _i < _len; _i++) {
        window = windows[_i];
        _results.push((function() {
          var _j, _len1, _ref, _results1;
          _ref = window.tabs;
          _results1 = [];
          for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
            tab = _ref[_j];
            _results1.push(chrome.tabs.sendMessage(tab.id, args, null));
          }
          return _results1;
        })());
      }
      return _results;
    });
  };

  shouldShowUpgradeMessage = function() {
    if (!Settings.get("previousVersion")) {
      Settings.set("previousVersion", currentVersion);
    }
    return Utils.compareVersions(currentVersion, Settings.get("previousVersion")) === 1;
  };

  openOptionsPageInNewTab = function() {
    return chrome.tabs.getSelected(null, function(tab) {
      return chrome.tabs.create({
        url: chrome.runtime.getURL("pages/options.html"),
        index: tab.index + 1
      });
    });
  };

  registerFrame = function(request, sender) {
    if (!framesForTab[sender.tab.id]) {
      framesForTab[sender.tab.id] = {
        frames: []
      };
    }
    if (request.is_top) {
      focusedFrame = request.frameId;
      framesForTab[sender.tab.id].total = request.total;
    }
    return framesForTab[sender.tab.id].frames.push({
      id: request.frameId,
      area: request.area
    });
  };

  handleFrameFocused = function(request, sender) {
    return focusedFrame = request.frameId;
  };

  getCurrFrameIndex = function(frames) {
    var i, _i, _ref;
    for (i = _i = 0, _ref = frames.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
      if (frames[i].id === focusedFrame) {
        return i;
      }
    }
    return frames.length + 1;
  };

  portHandlers = {
    keyDown: handleKeyDown,
    settings: handleSettings,
    filterCompleter: filterCompleter
  };

  sendRequestHandlers = {
    getCompletionKeys: getCompletionKeysRequest,
    getCurrentTabUrl: getCurrentTabUrl,
    openUrlInNewTab: openUrlInNewTab,
    openUrlInIncognito: openUrlInIncognito,
    openUrlInCurrentTab: openUrlInCurrentTab,
    openOptionsPageInNewTab: openOptionsPageInNewTab,
    registerFrame: registerFrame,
    frameFocused: handleFrameFocused,
    upgradeNotificationClosed: upgradeNotificationClosed,
    updateScrollPosition: handleUpdateScrollPosition,
    copyToClipboard: copyToClipboard,
    isEnabledForUrl: isEnabledForUrl,
    saveHelpDialogSettings: saveHelpDialogSettings,
    selectSpecificTab: selectSpecificTab,
    refreshCompleter: refreshCompleter,
    createMark: Marks.create.bind(Marks),
    gotoMark: Marks.goto.bind(Marks)
  };

  window.runTests = function() {
    return open(chrome.runtime.getURL('tests/dom_tests/dom_tests.html'));
  };

  Commands.clearKeyMappingsAndSetDefaults();

  if (Settings.has("keyMappings")) {
    Commands.parseCustomKeyMappings(Settings.get("keyMappings"));
  }

  populateValidFirstKeys();

  populateSingleKeyCommands();

  if (shouldShowUpgradeMessage()) {
    sendRequestToAllTabs({
      name: "showUpgradeNotification",
      version: currentVersion
    });
  }

  chrome.windows.getAll({
    populate: true
  }, function(windows) {
    var createScrollPositionHandler, tab, window, _i, _len, _results;
    _results = [];
    for (_i = 0, _len = windows.length; _i < _len; _i++) {
      window = windows[_i];
      _results.push((function() {
        var _j, _len1, _ref, _results1;
        _ref = window.tabs;
        _results1 = [];
        for (_j = 0, _len1 = _ref.length; _j < _len1; _j++) {
          tab = _ref[_j];
          updateOpenTabs(tab);
          createScrollPositionHandler = function() {
            return function(response) {
              if (response != null) {
                return updateScrollPosition(tab, response.scrollX, response.scrollY);
              }
            };
          };
          _results1.push(chrome.tabs.sendMessage(tab.id, {
            name: "getScrollPosition"
          }, createScrollPositionHandler()));
        }
        return _results1;
      })());
    }
    return _results;
  });

}).call(this);
