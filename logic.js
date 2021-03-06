//var addLibrary = document.getElementById("addLibrary");
const { dialog } = require('electron').remote
const { BrowserWindow } = require('electron').remote
const settings = require('electron-settings');
const fetch = require('node-fetch');
const keytar = require('keytar'); //used in discord auth, keeping for future updates
const fs = require('fs');
const shell = require('node-powershell');
var elShell = require('electron').shell;
var appVersion = require('electron').remote.app.getVersion();
const electron = require('electron');
const appData = (electron.app || electron.remote.app).getPath('userData');

var development = false;
var dbLoc;

//this is for handling all search features
var searchInputElement = document.getElementById("searchTextField");
var searchIconElement = document.getElementById("searchTextIcon");
searchInputElement.addEventListener("keyup",
function (event) {
  if (event.keyCode === 13) {
    event.preventDefault();
    search();
  }
});

//open links externally by default
document.addEventListener('click', function (event) {
  if (event.target.tagName === 'A' && event.target.href.startsWith('http')) {
    event.preventDefault()
    elShell.openExternal(event.target.href)
  }
});

var FingerPrintDBInit = "";


//This is the startup function, loading needed elements
function startFunction() {
  initSettings();
  sidebarVis();
  gameLibraryVis();

  if (development) {
    dbLoc = "./data/fingerprinting_db.json";
  } else {
    dbLoc = appData+"/fingerprinting_db.json";
  }

  dbHealthCheck();
  //this is for loading the searchList
  searchList();
  setTimeout(dbUpdateCheck, 1000);  //this wait is needed to let the fs function complete.
  //gameUpdateCheck();
  // While this could be called right away, in testing it added nearly 70~100ms to
  //first load the page. Will have it run in the background, after load
  setTimeout(gameUpdateCheck, 2000);
  setTimeout(newGameScan, 5000);
}

function initSettings() {
  //this will be for creating first time settings that need to be there
  if (!settings.hasSync('discordLink')) {
    //discord linking hasn't been declared,
    //so declare as false
    settings.setSync('discordLink', {
      status: false
    });
  }

  if (!settings.hasSync('game_list')) {
    settings.setSync('game_list', {
      list: "",
    });
  }

  if (!settings.hasSync('last_game_scan')) {
    settings.setSync('last_game_scan', {
      time: 0
    });
  }

  if (!settings.hasSync('last_game_search')) {
    settings.setSync('last_game_search', {
      time: 0
    });
  }

  if (!settings.hasSync('recently_played')) {
    settings.setSync('recently_played', {
      list: ""
    });
  }

  if (!settings.hasSync('db_version')) {
    settings.setSync('db_version', {
      version: ""
    });
  }

}

function dbHealthCheck() {
  //this should check if the database exists, and if its up to Date
  try {
    if (FingerPrintDBInit == "") {
      //db has not been initialized.
      if (!fs.existsSync(appData+"/fingerprinting_db.json")) {
        //if the db doesn't exist within the %AppData%
        console.log("Database doesn't exist locally. Downloading...");
        try {
          dbUpdate()
          .then(res => {
            try {
              fs.readFile(appData+"/fingerprinting_db.json", 'utf8', function(err, data) {
                if (err) {
                  console.log("Error occured Reading newly downloaded Database: "+err);
                  gameNotifManager("err", "Error Reading Database: "+err);
                }
                FingerPrintDBInit = JSON.parse(data);
                dbLoc = appData+"/fingerprinting_db.json";
                console.log("Successfully created Var FingerPrintDBInit");
              });
            } catch(err) {
              console.log("Unknown Error Reading New Database: "+err);
              gameNotifManager("err", "Unknown Error Reading New Database: "+err);
            }
          })
          .catch(err => {
            console.log("Error while downloading DB: "+err);
          });
        } catch(err) {
          console.log("Unable to download Database");
        }
      } else {
        //if the db DOES exist in %AppData%
        try {
          fs.readFile(appData+"/fingerprinting_db.json", 'utf8', function(err, data) {
            if (err) {
              console.log("Error occured Reading newly downloaded Database: "+err);
              gameNotifManager("err", "Error Reading Database: "+err);
            }
            FingerPrintDBInit = JSON.parse(data);
            dbLoc = appData+"/fingerprinting_db.json";
            console.log("Successfully created Var FingerPrintDBInit");
          });
        } catch(err) {
          console.log("Unable to read Database: "+err);
          gameNotifManager("err", "Unable to read Database: "+err);
        }
      }
    }
  } catch(err) {
    console.log("Unable to Initialize DB: "+err);
    gameNotifManager("err", "Unable to Initialize DB: "+err);
  }
}

function dbUpdate() {
  return new Promise(function(resolve, reject) {
    fetch("https://raw.githubusercontent.com/confused-Techie/Gaming-Gaggle/main/data/fingerprinting_db.json")
    .then(res => res.text())
    .then(body => {
      //now to write the file
      fs.writeFile(appData+'/fingerprinting_db.json', body, function(err) {
        if (err) {
          console.log("Error Writing Database: "+err);
          gameNotifManager("err", "Error Writing Database: "+err);
          reject("Error Writing Database: "+err);
        }
        console.log("Successfully wrote Database: "+appData+"/fingerprinting_db.json");
        resolve("Success");
      });
    });
  });
}

function dbUpdateCheck() {
  //this is for checking and hopefully updating the database

  if (settings.hasSync('db_version')) {
    //assign version if empty
    if (settings.getSync('db_version.version') == "") {
      settings.setSync('db_version', {
        version: FingerPrintDBInit.version+""
      });
      console.log("Database Version: "+settings.getSync('db_version.version'));
    } else {
      //if already a valid version, see if newest
      fetch("https://raw.githubusercontent.com/confused-Techie/Gaming-Gaggle/main/data/fingerprinting_db.json")
      .then(res => res.json())
      .then(body => {
        if (settings.getSync('db_version.version') != body.version) {
          //if the online version is not the same as the local version then replace
          dbUpdate()
          .then( res => {
            dbHealthCheck();
            //once updated run Helth Check to ensure the initialized DB is the newest download
            console.log("Database Version: "+settings.getSync('db_version.version'));
          });
        }
      });
    }
  } else {
    console.log("Database Settings not found");
    gameNotifManager("err", "Database Settings not found");
  }
}

function searchList() {
  let searchListDataToInsert = "";
  document.getElementById('gamesSearch').innerHTML = "";
  //clear it in case this is recalled.
  try {
    if (settings.hasSync('game_list') && settings.getSync('game_list.list') != "") {
      //ensure the game_list exists and isn't empty
      var tempGameList = (settings.getSync('game_list.list')).split(",");
      for (let i = 0; i < tempGameList.length; i++) {
        //now simply loop through all games adding the respective actual game to the search
        var game_itemName = settings.getSync(tempGameList[i]);
        searchListDataToInsert += "<option value='"+game_itemName.details.name+"'>";
      }
    } else {
      console.log("Game List doesn't exist or is empty.");
    }
  } catch(err) {
    console.log("Error creating search index: "+err);
    gameNotifManager("err", err);
  }
  document.getElementById('gamesSearch').innerHTML += searchListDataToInsert;
}

function settingsVis() {
  var settingsToInsert = "";
  const librariesToInsert = [];
  document.getElementById('settings-main-page').innerHTML = ""; //clear any data there currntly

  //application information
  settingsToInsert += "<span style='float:right;display:block;'><p style='text-align: center; margin-left:15%;'>Application Version: "+appVersion+"</p></span>";
  settingsToInsert += "<span style='float:right;display:block;'><p style='text-align: center; margin-left:15%;'>Database Version: "+settings.getSync('db_version.version')+"</p></span>";
  if (settings.hasSync('game_list') && settings.getSync('game_list.list') != "") {
    settingsToInsert += "<span style='float: left;'><h4>Libraries</h4>";
    let gameIDs = (settings.getSync('game_list.list')).split(",");
    for (let i = 0; i < gameIDs.length; i++) {
      game_item = settings.getSync(gameIDs[i]);
      if (librariesToInsert.indexOf(game_item.details.library) == -1) {
        librariesToInsert.push(game_item.details.library);
        settingsToInsert += "<input type='checkbox' class='form-check-input' id='"+game_item.details.library+"' style='margin-left:10px;'><label class='form-check-label' for='"+game_item.details.library+"' style='margin-left:30px;'>"+game_item.details.library+"</label><br/>";
      }
    }
    settingsToInsert += "<button type='submit' class='btn btn-primary' onclick='deleteFolderCheck("+JSON.stringify(librariesToInsert)+")'>Delete</button></span>";
  }

  //background settings.

  document.getElementById('settings-main-page').innerHTML += settingsToInsert;
  document.getElementById('settings-page').style.display = "block";
}

function deleteFolderCheck(libraryCheck) {
  //libraryCheck should be an array of all libraries, which we can then check weather they are checked or not
  try {
    for (let i = 0; i < libraryCheck.length; i++) {
      if (document.getElementById(libraryCheck[i]).checked) {
        try {
          gameIDs = (settings.getSync('game_list.list')).split(",");
          for (let y = 0; y < gameIDs.length; y++) {
            var game_item = settings.getSync(gameIDs[y]);
            if (libraryCheck[i] == game_item.details.library) {
              console.log("Removing "+game_item.details.name+" from Games");
              try {
                settings.unsetSync(game_item.details.appid);  //refer to gameUpdateCheck for logic
                let game_item_pos = gameIDs.indexOf(game_item.details.appid);
                let post_removed_item = gameIDs.splice(game_item_pos, 1);
                try {
                  settings.setSync('game_list', {
                    list: gameIDs+""
                  });
                  console.log("Successfully removed from Game List");
                  //it seems there may be a bug where not all games with this library are deleted on the first try
                } catch(err) {
                  console.log("Error Removing game from Game List: "+err);
                  gameNotifManager("err", "Error Removing game from Game List: "+err);
                }
              } catch(err) {
                console.log("Error Removing Game Data: "+err);
                gameNotifManager("err", "Error Removing Game Data: "+err);
              }
            }
          }
        } catch(err) {
          console.log("Error reading Game List: "+err);
          gameNotifManager("err", "Error reading Game List: "+err);
        }
      }
    }
  } catch(err) {
    console.log("Error checking Library Array: "+err);
    gameNotifManager("err", "Error checking Library Array: "+err);
  }
  //hopefully will execute once everything is done.
  document.getElementById('settings-page').style.display = 'none';
  startFunction();
}

function gameLibraryVis() {
  //this is made simply to look at the saved apps and create the main HTML page for it.
  document.getElementById('game-container').innerHTML = ""; //fixes an issue where calling from a finished API may display data twice

  //this will be V2 of displaying the games with the new settings framework
  var displayData = "";
  if (settings.hasSync('game_list') && settings.getSync('game_list.list') != "") {
    //ensure the game list exists
    try {
      gameIDs = (settings.getSync('game_list.list')).split(",");
      for (let i = 0; i < gameIDs.length; i++) {
        try {
          game_item = settings.getSync(gameIDs[i]);
          var insertName = game_item.details.name;
          var insertIdentity = game_item.details.appid;
          var insertDescription = game_item.details.description;
          var insertImage = game_item.details.img;
          var insertLaunch= "";

          //now to check how to launch the game itself
          if (game_item.details.launch_type == "uri") {
            //the uri is simply a normal link on the play button.
            insertLaunch = "<a href='"+game_item.details.launch_cmd+"'' onclick=gameLaunchManager('"+insertIdentity+"')><img src='./data/images/play.svg' style='float:right;background-color:#212121;'></a>";
          } else if (game_item.details.launch_type == "cmd") {
            insertLaunch = `<a href='#' onclick='gameLaunchManager(${JSON.stringify(insertIdentity)});consoleGameLaunch(${JSON.stringify(game_item.details.launch_cmd)})'><img src='./data/images/play.svg' style='float:right;background-color:#212121;'></a>`;
          }

          if (insertLaunch != "") {
            //confirm the insertLaunch is set
            displayData += "<div class='grid-item' id='"+insertName+"'><div class='card'><div class='card-body'><div class='card-title'>";
            displayData += insertLaunch+insertName;
            displayData += "</div><p class='card-text'>"+insertDescription+"</p>";
            displayData += "<div class='card-footer text-muted'><img src='"+insertImage+"'/>";
            displayData += "</div></div></div></div>";
          } else {
            console.log("Unrecognized Launch Settings, skipping: "+game_item.details.name);
          }
        } catch(err) {
          console.log("There was an error accessing settings for: "+gameIDs[i]);
          gameNotifManager("err", "There was an error accessing settings for: "+gameIDs[i]);
        }
      }
    } catch(err) {
      console.log("There was an error accessing Game Data");
      gameNotifManager("err", "There was an error accessing Game Data: "+err);
    }
  } else {
    console.log("No Saved games");
    displayData += "<div class='grid-item' id='no-data'><div class='card'><div class='card-body'><div class='card-title'>";
    displayData += "Looks like you haven't added any Games yet";
    displayData += "</div><p class='card-text'>To add some games just click the folder icon on the left! Or read more about it <a href='https://github.com/confused-Techie/Gaming-Gaggle/wiki/Adding-Your-Games-to-Gaming-Gaggle'>here</a>. Also it's recommended to add you C Drive First</p>";
    displayData += "<div class='card-footer text-muted'>";
    displayData += "</div></div></div></div>";
  }

  document.getElementById('game-container').innerHTML += displayData;
}

function sidebarVis() {

  //firstly clear current settings
  document.getElementById('sidebar-container').innerHTML = "";
  var sidebarDataToInsert = "";
  //add the return to top arrow
  sidebarDataToInsert += "<a href='#topOfPage'><img src='./data/images/arrow-up-circle.svg' style='width:20px;float:right;margin-right:20px;background-color:#212121;'></a>";
  //first to load saved libraries
  if (settings.hasSync('game_list') && settings.getSync('game_list.list') != "") {
    sidebarDataToInsert += "<div class='sidebar-item'><div><dl><dt>Libraries</dt><hr>";
    try {
      const librariesToInsert = [];
      gameIDs = (settings.getSync('game_list.list')).split(",");
      for (let i = 0; i < gameIDs.length; i++) {
        try {
          game_item = settings.getSync(gameIDs[i]);
          //now I need to see if the library the game_item has is
          //in the array of librariesToInsert; To ensure no duplicates
          try {
            if (librariesToInsert.indexOf(game_item.details.library) == -1) {
              //since indexOf returns -1 if no match is found this can be used to ensure it doesn't already exist
              librariesToInsert.push(game_item.details.library);
              //then add data to sidebar
              sidebarDataToInsert += "<dd>"+game_item.details.library+"</dd>";
            }
          } catch(err) {
            console.log("Error checking Library Duplication: "+err);
            gameNotifManager("err", "Error checking Library Duplication: "+err);
          }
        } catch(err) {
          console.log("Error retreiving game details: "+err);
          gameNotifManager("err", "Error retreiving game details: "+err);
        }
      }
    } catch(err) {
      console.log("Error Reading Game List: "+err);
      gameNotifManager("err", "Error Reading Game List: "+err);
    }
    sidebarDataToInsert += "<dd><a href='#' onclick='GameInspectorV2()'><img src='./data/images/folder-plus.svg' style='width:20px;'></a>";
    sidebarDataToInsert += "<a href='#' onclick='settingsVis()'><img src='./data/images/folder-minus.svg' style='width:20px;margin-left:10px;'></a></dd>";
    sidebarDataToInsert += "</dl></div></div>";
  } else {
    console.log("No Saved libraries");
    sidebarDataToInsert += "<div class='sidebar-item'><div><dl><dt>Libraries</dt><hr>";
    sidebarDataToInsert += "<dd><a href='#' onclick='GameInspectorV2()'><img src='./data/images/folder-plus.svg' style='width:20px;'></a>";
    sidebarDataToInsert += "<a href='#' onclick='settingsVis()'><img src='./data/images/folder-minus.svg' style='width:20px;margin-left:10px;'></a></dd>";
    sidebarDataToInsert += "</dl></div></div>";
  }

  //time for full game amount
  if (settings.hasSync('game_list') && settings.getSync('game_list.list') != "") {
    let gameIDs = (settings.getSync('game_list.list')).split(",");
    sidebarDataToInsert += "<div class='sidebar-item'><div><dl><dt>Games</dt><hr>";
    sidebarDataToInsert += "<dd>"+parseInt(gameIDs.length)+" Games</dd>";
    sidebarDataToInsert += "</dl></div></div>";
  }

  //time for recently played games.
  if (settings.hasSync('recently_played') && settings.getSync('recently_played.list') != "") {
    sidebarDataToInsert += "<div class='sidebar-item'><div ><dl><dt>Recently Played</dt><hr>";
    let gameList = (settings.getSync('recently_played.list')).split(",");
    for (let i = 0; i < gameList.length-1; i++) {
      try {
        if (typeof gameList[i] != 'undefined' || gameList[i] != "" || typeof gameList[i] != 'null') {
          let game_item = settings.getSync(gameList[i]);
          //sidebarDataToInsert += "<a href='#' onclick='document.getElementById('"+game_item.details.appid+"').scrollIntoView()'><dd>"+game_item.details.name+"</dd></a><hr style='border-top: 1px dotted black;background-color: black;'>";
          sidebarDataToInsert += `<dd style='cursor:pointer;' onclick='document.getElementById("${game_item.details.name}").scrollIntoView();'>${game_item.details.name}</dd><hr style='border-top: 1px dotted black; background-color: black;'>`;
        }
      } catch(err) {
        console.log("Error: Unable to retreive Game Settings: "+err+" Of "+gameList[i]);
        gameNotifManager("err", "Unable to Retrieve Game Settings: "+err);
      }
    }
    sidebarDataToInsert += "</dl></div></div>";
  }

  document.getElementById('sidebar-container').innerHTML = sidebarDataToInsert;

  //if (settings.getSync('discordLink.status')) {
  //  console.log("Discord Successfully Linked");
  //  try {
  //    var discordDataToInsert = "";
  //    DiscordAPI("user_name").then(retreivedUser => {
  //      console.log("Retreived Username for Sidebar: "+retreivedUser);
  //      DiscordAPI("user_icon").then(discordIcon => {
  //        discordDataToInsert += "<div class='sidebar-item'><dl><dt>Discord</dt><hr>";
  //        discordDataToInsert += `<div class="imgCenter"><img src='${discordIcon}' alt="Discord Profile Icon" style='height:30px;width:30px;float:left;'></div>`;
  //        discordDataToInsert += "<dd>"+retreivedUser+"</dd>";
  //        discordDataToInsert += "</dl></div>";
  //        document.getElementById('sidebar-container').innerHTML += discordDataToInsert;
  //      });
  //    });
  //  }
  //  catch(ex) {
  //    console.log("Unable to access saved Discord Data: "+ex);
  //  }
  //} else {
  //  console.log("Discord has not been linked");
  //  document.getElementById('sidebar-container').innerHTML += "<div onclick='linkDiscord()'>Link your Discord!</div>";
  //}

}

function newGameScan() {
  //used to find out if within the provided libraries there are new games
  if (settings.hasSync('last_game_search')) {
    //this will use the same last game scan and check every four hours.
    var currentTimeCheck = new Date();
    if (currentTimeCheck.getTime() - settings.getSync('last_game_search.time') > 14400000) {
      console.log("Starting New game check.");
      if (settings.hasSync('game_list') && settings.getSync('game_list.list') != "") {
        try {
          let gameIDs = (settings.getSync('game_list.list')).split(",");
          const libraryList = [];
          for (let i = 0; i < gameIDs.length; i++) {
            try {
              game_item = settings.getSync(gameIDs[i]);
              try {
                if (libraryList.indexOf(game_item.details.library) == -1) {
                  libraryList.push(game_item.details.library);
                  //then actually check the library
                  DirInspectorV2(game_item.details.library);
                }
              } catch(err) {
                console.log("Error checking Library Duplication: "+err);
              }
            } catch(err) {
              console.log("Error retreiving game details: "+err);
            }
          }
          var currentTimeSave = new Date();
          settings.setSync('last_game_search', {
            time: currentTimeSave.getTime()
          });
        } catch(err) {
          //error during game id scan
          console.log("Error Checking game list: "+err);
          gameNotifManager("err", "Error checking game list: "+err);
        }
      }
    } else {
      //not time to update
      console.log("Game Library was scanned less than 4 hours ago");
    }
  } else {
    //last game scan doesn't exist
    console.log("Error: Last Game Scan doesn't exist");
    gameNotifManager("err", "Error: Last Game Scan doesn't exist");
  }
}

function gameUpdateCheck() {
  if (settings.hasSync('last_game_scan')) {
    var currentTimeCheck = new Date();
    if (currentTimeCheck.getTime() - settings.getSync('last_game_scan.time') >  14400000) {
      console.log("Starting game update check");
      //used to check if any games have been deleted or moved
      if (settings.hasSync('game_list') && settings.getSync('game_list.list') != "") {
        try {
          let gameIDs = (settings.getSync('game_list.list')).split(",");
          for (let i = 0; i < gameIDs.length; i++) {
            let game_item = settings.getSync(gameIDs[i]);
            try {
              if (!fs.existsSync(game_item.details.location)) {
                console.log("Couldn't Find: "+game_item.details.name);
                gameNotifManager("game_scan", game_item.details.name);
                try {
                  settings.unsetSync(game_item.details.appid);  //first remove the main data
                  let game_item_pos = gameIDs.indexOf(game_item.details.appid); //finds the position of the game
                  let post_removed_item = gameIDs.splice(game_item_pos, 1); //removes one game based on its position
                  try {
                    settings.setSync('game_list', {
                      list: gameIDs+""
                    });
                    console.log("Successfully removed: "+game_item.details.name);
                    startFunction();
                  } catch(err) {
                    console.log("Error Removing game from game list: "+err);
                    gameNotifManager("err", "Error Removing game from game list: "+err);
                  }
                } catch(err) {
                  console.log("Unable to remove: "+game_item.details.name+"::"+err);
                  gameNotifManager("err", "Error: Unable to remove: "+game_item.details.name+"::"+err);
                }
              }
            } catch(err) {
              console.log("Error checking file status of game: "+err);
              gameNotifManager("err", "Error checking file status of game: "+err);
            }
          }
          var currentTimeSave = new Date();
          settings.setSync('last_game_scan', {
            time: currentTimeSave.getTime()
          });
        } catch(err) {
          console.log("Error Checking game list: "+err);
          gameNotifManager("err", "Error checking game list: "+err);
        }
      }
    } else {
      console.log("Game Library was scanned less than 4 hours ago");
    }
  } else {
    console.log("Error: Last Game Scan doesn't exist");
    gameNotifManager("err", "Error: Last Game Scan doesn't exist");
  }
}

function linkDiscord() {
  var authWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      nodeIntegration: false,
    },
  });
  var discordURL = 'https://discord.com/api/oauth2/authorize?client_id='+SEC_Discord_client_id+'&redirect_uri=http%3A%2F%2Flocalhost&response_type=code&scope=identify';

  authWindow.loadURL(discordURL);
  authWindow.show();

  //to properly get the redirect and XMLpost, i may have to register
  //a URI for Game Gaggle,

  authWindow.webContents.on('will-navigate', function(event, url) {
    console.log("Will-Navigate Returned URL...");
    if (url.includes("code")) {
      //includes the access code
      authWindow.destroy();
      var tempURLSplit = url.split("=");
      var discordAccessCode = tempURLSplit[1];
      //now time to make the Post request to exchange the Access Code wtih a User's Access Token
      const discordExchangeData = {
        client_id: SEC_Discord_client_id,
        client_secret: SEC_Discord_client_secret,
        grant_type: 'authorization_code',
        redirect_uri: SEC_Discord_redirect_uri,
        code: discordAccessCode,
        scope: 'identify',
      };

      fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        body: new URLSearchParams(discordExchangeData),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }).then(res => res.json())
      .then(info => {
        //mark the time the original call was made.
        var created_time = new Date();
        //console.log(info.token_type);
        //console.log(info.access_token);
        try {
          keytar.setPassword("Gaming Gaggle", "DiscordAccessToken", info.access_token);
          keytar.setPassword("Gaming Gaggle", "DiscordRefreshToken", info.refresh_token);
          console.log("Successfully saved credentials to keychain.");
          settings.setSync('discordLink', {
            status: true
          });
          //finally after successfully saving credentials change discord to true for linking
          //then save the non-secret discord link data.
          //since the expires_in value is based on seconds from the time the request is made
          //that also needs to be saved
          settings.setSync('discordLinkData', {
            expires_in: info.expires_in,
            scope: info.scope,
            token_type: info.token_type,
            created_at: created_time.getTime(),
          });
          console.log("Successfully saved Non-Secret Discord Data");
        }
        catch(ex) {
          console.log("There was an error saving to the keychain: "+ex);
        }
      });


    } else if (url.includes("error")) {
      //includes an error
      authWindow.destroy();
      console.log("Error with Discord Integration: "+url);
    } else {
      //generic error
      console.log("Generic Error");
    }
  });

  //Reset the authWindow on close
  authWindow.on(
    'close',
    function() {
      authWindow = null;
    },
    false
  );
}

function DiscordAPI(option) {
  //I will wrap this function around a promise to properly use it as a promise elsewhere
  return new Promise(function(resolve, reject) {
    var discordLinkedSettings = settings.getSync("discordLinkData");
    const DiscordAccessToken = keytar.getPassword('Gaming Gaggle', 'DiscordAccessToken');
    const DiscordRefreshToken = keytar.getPassword('Gaming Gaggle', 'DiscordRefreshToken');
    //we need the current time to compare to
    var expiry = new Date();

    if ( (((discordLinkedSettings.created_at / 1000) + Number(discordLinkedSettings.expires_in)) - 86400)
          > (expiry.getTime() / 1000) ) { //this will return false if expired, or a day from expiry, so every 6 days

      if (option == "user_name") {
        console.log("Fetching username of Discord Account...");
        DiscordAccessToken.then((DiscordAccessTokenPromise) => {
          fetch('https://discord.com/api/users/@me', {
            headers: {
              authorization: `${discordLinkedSettings.token_type} ${DiscordAccessTokenPromise}`,
            },
          })
          .then(temp => temp.json())
          .then(res => {
            resolve(res.username);
          });
        });
      }
      else if (option == "user_icon") {
        //before attemtping to get the avatar we first need to check if it exists.
        var discordAvatarLoc = "./data/cache/discordAvatar.png";
        if (!fs.existsSync(discordAvatarLoc)) {
          //to get the avatar we first need to get the standard user details
          console.log("Fetching User Details to assist with User Avatar Fetch...");
          try {
            DiscordAccessToken.then((DiscordAccessTokenPromise) => {
              try {
                fetch('https://discord.com/api/users/@me', {
                  headers: {
                    authorization: `${discordLinkedSettings.token_type} ${DiscordAccessTokenPromise}`,
                  },
                })
                .then(temp => temp.json())
                .then(res => {
                  //now with user data time to request specific avatar data
                  try {
                    fetch(`https://cdn.discordapp.com/avatars/${res.id}/${res.avatar}.png`, {
                      headers: {
                        authorization: `${discordLinkedSettings.token_type} ${DiscordAccessTokenPromise}`,
                        'Content-Type': 'image/png',
                      },
                    }).then(resIcon => {
                      const fileStream = fs.createWriteStream("./data/cache/discordAvatar.png");
                      resIcon.body.pipe(fileStream);
                      resIcon.body.on("error", reject);
                      fileStream.on("finish", () => { resolve("./data/cache/discordAvatar.png"); });
                    });
                  } catch(ex) { console.log("Unable to grab Discord Avatar: "+ex); }
                });
              } catch(ex) { console.log("Unable to access Network Request for Discord user Data: "+ex); }
            });
          } catch(ex) { console.log("Unable to access Keychain Data: "+ex); }
        }
        else {  //discordAvatar file does exists
          console.log("Discord Avatar is already cached...");
          resolve(discordAvatarLoc);
        }
      }
    } else {
      //refresh the token
      console.log("Token has expired or is nearly expired");

      DiscordRefreshToken.then((DiscordRefreshTokenPromise) => {
        const discordRefreshData = {
          client_id: SEC_Discord_client_id,
          client_secret: SEC_Discord_client_secret,
          grant_type: 'refresh_token',
          refresh_token: DiscordRefreshTokenPromise,
          redirect_uri: SEC_Discord_redirect_uri,
          scope: 'identify',
        };

        fetch('https://discord.com/api/oauth2/token', {
          method: 'POST',
          body: new URLSearchParams(discordRefreshData),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }).then(res => res.json())
        .then(info => {
          var refresh_created_time = new Date();

          //now save all related Settings
          try {
            keytar.setPassword("Gaming Gaggle", "DiscordAccessToken", info.access_token);
            keytar.setPassword("Gaming Gaggle", "DiscordRefreshToken", info.refresh_token);
            console.log("Successfully saved Refreshed credentials to keychain...");
            settings.setSync('discordLink', {
              status: true
            });

            //refer to initial Authorization code exchange for Access Token for documentation
            settings.setSync('discordLinkData', {
              expires_in: info.expires_in,
              scope: info.scope,
              token_type: info.token_type,
              created_at: refresh_created_time.getTime(),
            });
            console.log("Successfully saved Non-Secret Refresh Discord Data...");
            DiscordAPI(option).then(resolve);
          }
          catch(ex) {
            console.log("There was an error saving to the keychain: "+ex);
            reject("There was an error saving to keychain: "+ex);
          }

        });
      });

    }
  });
}

function search() {
  console.log("search() accessed; Value: "+document.getElementById("searchTextField").value);

  try {
    document.getElementById(document.getElementById("searchTextField").value).scrollIntoView();
  } catch(ex) {
    console.log("Couldn't navigate to search: "+ex);
    console.log("Text: "+document.getElementById("searchTextField").value);
  }
}

function filterSearch() {

}

function consoleGameLaunch(cmd) {
  if (cmd == "false") {
    gameNotifManager("err", "Game client hasn't been detected.");
  } else {
    const ps = new shell({
      executionPolicy: 'Bypass',
      noProfile: true
    });

    ps.addCommand(cmd);
    ps.invoke()
    .then(output => {
      console.log(output);
    })
    .catch(err => {
      console.log(err);
      gameNotifManager("err", err);
    });
  }
}

function GameInspectorV2() {
  //Generation 2 of the Game Scanning logic.
  //In hopes of reducing complexity and resource usage.

  folderResult = dialog.showOpenDialogSync({
    title: "Add Game Library",
    buttonLabel: "Add Library",
    properties: ['openDirectory', 'dontAddToRecent']
  });
  if (folderResult === undefined) {
    console.log("No Directory Selected");
    return;
  } else {
    gameNotifManager("create", "");
    console.log("Result of Library Pick: "+folderResult[0]);
    try {
      DirInspectorV2(folderResult[0]).then(DirIResult => {
        if (DirIResult == "true") {
          console.log("Successfully scanned Folder");
          //save directory
        }
      }).catch(err => {
        console.log("Error Occured: "+err);
        gameNotifManager("err", "Error Occured: "+err);
      });
    }
    catch(ex) {
      console.log("Unable to call DirScan: " + ex);
      gameNotifManager("err", "Unable to initiate scan: "+ex);
    }
  }
}

function DirInspectorV2(startDir) {
  console.log("DirInspectorV2 access");
  return new Promise(function(resolve, reject) {
    const Root = fs.readdirSync(startDir);

    //this will handle the 5 hops down
    for (let i = 0; i < Root.length; i++) {
      //this will loop through every folder in the selected root
      var root_check = startDir+"/"+Root[i];
      //this defines our working directory,
      MatchCheckV2(Root[i], root_check, startDir);
      //calls MatchCheck with working directory, and the folder name
      var root_lstat_check;
      //this will help avoid the exception thrown by lstatSync
      try {
        root_lstat_check = fs.lstatSync(root_check).isDirectory();
      } catch(ex) {
        root_lstat_check = false;
      }
      //this will check for having access to the file
      var root_access_check=true;
      //try {
      //  if (fs.accessSync(root_check, fs.constants.R_OK) == "undefined") {
      //    root_access_check = true;
      //  }
      //} catch(ex) {
      //  console.log("Access Denied: "+root_check+": Error: "+ex);
      //}
      if (fs.existsSync(root_check) && root_lstat_check && root_access_check) {

        const secondary_R = fs.readdirSync(root_check);
        for (let u = 0; u < secondary_R.length; u++) {
          var secondary_check = root_check+"/"+secondary_R[u];
          MatchCheckV2(secondary_R[u], secondary_check, startDir);
          var secondary_lstat_check;
          try {
            secondary_lstat_check = fs.lstatSync(secondary_check).isDirectory();
          } catch(ex) {
            secondary_lstat_check = false;
          }
          if (fs.existsSync(secondary_check) && secondary_lstat_check) {

            const tertiary_R = fs.readdirSync(secondary_check);
            for (let y = 0; y < tertiary_R.length; y++) {
              var tertiary_check = secondary_check+"/"+tertiary_R[y];
              MatchCheckV2(tertiary_R[y], tertiary_check, startDir);
              var tertiary_lstat_check;
              try {
                tertiary_lstat_check = fs.lstatSync(tertiary_check).isDirectory();
              } catch(ex) {
                tertiary_lstat_check = false;
              }
              if (fs.existsSync(tertiary_check) && tertiary_lstat_check) {

                const quaternary_R = fs.readdirSync(tertiary_check);
                for (let t = 0; t < quaternary_R.length; t++) {
                  var quaternary_check = tertiary_check+"/"+quaternary_R[t];
                  MatchCheckV2(quaternary_R[t], quaternary_check, startDir);
                  var quaternary_lstat_check;
                  try {
                    quaternary_lstat_check = fs.lstatSync(quaternary_check).isDirectory();
                  } catch(ex) {
                    quaternary_lstat_check = false;
                  }
                  if (fs.existsSync(quaternary_check) && quaternary_lstat_check) {

                    const quinary_R = fs.readdirSync(quaternary_check);
                    for (let r = 0; r < quinary_R.length; r++) {
                      var quinary_check = quaternary_check+"/"+quinary_R[r];
                      MatchCheckV2(quinary_R[r], quinary_check, startDir);
                      //at this point this is 5 hops down, and should be enough of a check.
                      resolve("true");
                    }
                  } //else { console.log("DirInspectorV2 Quaternary failure"); }
                }
              } //else { console.log("DirInspectorV2 Tertiary Failure"); }
            }
          } //else { console.log("DirInspectorV2 Secondary Failure"); }
        }
      } //else { console.log("DirInspectorV2 Root Failure");}
    }
  });
}

function MatchCheckV2(fileToScan, workingDir, chosenLibrary) {
  //now to check the passed files and directories for game data

  //in all of these there need to be checks to ensure no duplicates are saved
  //Steam Check
  if (fileToScan.includes("acf") && workingDir.includes("steamapps") && !workingDir.includes("steamapps/workshop")) {
    var foundSteamId = fileToScan.replace(/\D/g, '');
    console.log("Steam Game: "+foundSteamId);
    steamApiV2(foundSteamId, workingDir, chosenLibrary)
    .then(res => {
      console.log(res);
      startFunction();
    })
    .catch(err => {
      console.log(err);
    });
  }

  //epic check
  else if (fileToScan.includes("mancpn") && workingDir.includes(".egstore")) {
    fs.readFile(workingDir, 'utf8', function (err, data) {
      if (err) {
        console.log("Error occured reading file: "+err);
        gameNotifManager("err", "Error occured reading file: "+err);
      }
      let res = JSON.parse(data);
      console.log("Epic Game: "+res.AppName);
      epicApiV2(res.AppName, workingDir, chosenLibrary)
      .then(res => {
        console.log(res);
      })
      .catch(err => {
        console.log(err);
      });
    });
  }

  //battle.net client
  else if (fileToScan.includes("Battle.net.exe") && workingDir.includes("Battle.net")) {
    try {
      settings.setSync('battle_net_client', {
        set: true,
        loc: workingDir
      });
      console.log("Successfully Saved Battle.net Client");
    } catch(err) {
      gameNotifManager("err", "Error saving Battle.net Client: "+err);
    }
  }

  //riot client
  else if (fileToScan.includes("RiotClientServices.exe") && workingDir.includes("Riot Client")) {
    try {
      settings.setSync('riot_client', {
        set: true,
        loc: workingDir
      });
      console.log("Successfully Saved Battle.net Client");
    } catch(err) {
      gameNotifManager("err", "Error Saving Riot Client: "+err);
    }
  }

  //full DB check
  else {
    try {
        for (y in FingerPrintDBInit.games) {
          if (FingerPrintDBInit.games[y].search_method != "epic_games") {
            if (fileToScan.includes(FingerPrintDBInit.games[y].detect.file) && workingDir.includes(FingerPrintDBInit.games[y].detect.dir)) {
              console.log(FingerPrintDBInit.games[y].name+" Found in Full Check");
              otherApiV1(FingerPrintDBInit.games[y].unique_id, workingDir, chosenLibrary)
              .then(res => {
                console.log(res);
              })
              .catch(err => {
                console.log(err);
              });
            }
          }
        }
    } catch(err) {
      console.log("Error reading Database: "+err);
      gameNotifManager("err", "Error reading Database: "+err);
    }
  }

}

function steamApiV2(applicationID, loc, chosenLibrary) {
  //console.log("SteamApiV2 Accessed");
  return new Promise(function(resolve, reject) {
    //firstly to make the API request for game data
    try {
      fetch('http://store.steampowered.com/api/appdetails/?appids='+applicationID)
      .then(temp => temp.json())
      .then(res => {
        if (res[applicationID].success) {
          try {
            if (!settings.hasSync(applicationID)) {
              //put the rest of the logic for sving here
              try {
                settings.setSync(applicationID, {
                  details: {
                    appid: applicationID,
                    description: res[applicationID].data.short_description,
                    img: res[applicationID].data.header_image,
                    name: res[applicationID].data.name,
                    provider: "Steam",
                    library: chosenLibrary,
                    location: loc,
                    launch_type: "uri",
                    launch_cmd: `steam://rungameid/${applicationID}`
                  }
                });
                gameListManager(applicationID).then(gameListRes => {
                  resolve("Successfully Saved SteamAPI Settings: "+res[applicationID].data.name);
                }).catch(gameListerr => {
                  gameNotifManager("err", "Generic Error on Game List Save: "+gameListerr);
                  reject("Generic Error on game_list save: "+gameListerr);
                });

              } catch(err) {
                console.log("Error saving Steam API Settings for: "+res[applicationID].data.name+":: Error: "+err);
                gameNotifManager("err", "Error saving Steam API Settings for: "+res[applicationID].data.name+":: Error: "+err);
                reject("Error saving Steam API Settings for: "+res[applicationID].data.name+":: Error: "+err);

              }

            } else {
              console.log("This SteamID is already saved: "+res[applicationID].data.name);
              reject("Already Saved This SteamID: "+res[applicationID].data.name);
            }
            //resolve("Successfully Saved SteamAPi Settings: "+res[applicationID].data.name);
          } catch(err) {
            console.log("Error: Saving Settings: "+err);
            gameNotifManager("err", "Error: Saving Settings: "+err);
            reject("Error: Saving Settings: "+err);
          }
        } else {
          //there needs to be a check to see if the file scanned
          //is a tool or game. For now we may just disable to popup
          console.log("Error: Reaching Steam API Server: "+res.status+"::"+res.statusText);
          //gameNotifManager("err", "Error: Reaching Steam API Server: "+res.status+"::"+res.statusText);
          reject("Error: Reaching Steam API Server: "+res.status+"::"+res.statusText);
        }
      });
    } catch(err) {
      console.log("Steam API Error: "+err);
      gameNotifManager("err", "Steam API Error: "+err);
      reject("Steam API Error: "+err);
    }
  });
}

function epicApiV2(applicationID, loc, chosenLibrary) {
  return new Promise(function(resolve, reject) {
    //first to retreive the fingerprintDB
    try {
      fs.readFile(dbLoc, 'utf8', function(err, data) {
        if (err) {
          gameNotifManager("err", "Error occured reading Database: "+err);
          reject("Error occured reading Database: "+err);
        }
        let FingerPrintDB = JSON.parse(data);
        //loop through every game within the db
        for (y in FingerPrintDB.games) {
          if (FingerPrintDB.games[y].search_method == "epic_games") {
            //take only ones matching epic
            if (FingerPrintDB.games[y].unique_id == applicationID) {
              try {
                if (!settings.hasSync(applicationID)) {
                  //confirm it hasn't already been saved
                  //rest of save logic here
                  try {
                    settings.setSync(applicationID, {
                      details: {
                        appid: applicationID,
                        description: FingerPrintDB.games[y].meta_data.description,
                        img: FingerPrintDB.games[y].meta_data.img,
                        name: FingerPrintDB.games[y].name,
                        provider: "Epic Games",
                        library: chosenLibrary,
                        location: loc,
                        launch_type: "uri",
                        launch_cmd: FingerPrintDB.games[y].launch.cmd
                      }
                    });
                    gameListManager(applicationID).then(gameListRes => {
                      resolve("Successfully Saved Epic API Settings: "+FingerPrintDB.games[y].name);
                    }).catch(gameListerr => {
                      gameNotifManager("err", "Generic Error on Game List Save: "+gameListerr);
                      reject("Generic Error on game_list save: "+gameListerr);
                    });
                  } catch(err) {
                    console.log("Error saving Epic Games API settings for "+FingerPrintDB.games[y].name+":: Error: "+err);
                    gameNotifManager("err", "Error saving Epic Games API Settings for: "+FingerPrintDB.games[y].name+":: Error: "+err);
                    reject("Error saving Epic Games API settings for "+FingerPrintDB.games[y].name+":: Error: "+err);
                  }
                  //resolve("Successfully Saved EpicApi Settings for: "+applicationID);
                } else {
                  reject("Already Saved This Epic ID: "+applicationID);
                }
              } catch(ex) {
                gameNotifManager("err", "Error: Saving Settings: "+ex);
                reject("Error: Saving Settings: "+ex);
              }
            }
          }
        }
      })
    } catch(err) {
      gameNotifManager("err", "Error occured reading Fingerprint Database: "+err);
      reject("Error occured reading Fingerprint Database: "+err);
    }
  });
}

function otherApiV1(applicationID, loc, chosenLibrary) {
  //while there was never an OtherV1, I'm naming this V2
  //to keep in line with the new methodalogy
  console.log("Other API V1 accessed");
  return new Promise(function(resolve, reject) {
    try {
      fs.readFile(dbLoc, 'utf8', function(err, data) {
        if (err) {
          gameNotifManager("err", "Error occured reading Database: "+err);
          reject("Error occured reading Database: "+err);
        }
        let FingerPrintDB = JSON.parse(data);
        for (y in FingerPrintDB.games) {
          if (FingerPrintDB.games[y].search_method != "epic_games") {
            //since I want search method to contain the provider, they will differ during other calls
            if (FingerPrintDB.games[y].unique_id == applicationID) {
              try {
                if (!settings.hasSync(applicationID)) {
                  //confirm it hasn't already been saved
                  //rest of save logic here
                  try {
                    var tempLaunchDec;
                    if (FingerPrintDB.games[y].launch.method == "command_line:original") {
                      tempLaunchDec = 'start "'+loc+'" '+FingerPrintDB.games[y].launch.cmd;
                    } else if (FingerPrintDB.games[y].launch.method == "command_line:battle") {
                      if (settings.hasSync('battle_net_client')) {
                        tempLaunchDec = 'start "'+settings.getSync('battle_net_client.loc')+'" '+FingerPrintDB.games[y].launch.cmd;
                      } else {
                        tempLaunchDec = 'false';
                      }
                    } else if (FingerPrintDB.games[y].launch.method == "command_line:riot") {
                      if (settings.hasSync('riot_client')) {
                        tempLaunchDec = 'start "'+settings.getSync('riot_client.loc')+'" "'+FingerPrintDB.games[y].launch.cmd+'"';
                      } else {
                        tempLaunchDec = 'false';
                      }
                    }
                    settings.setSync(applicationID, {
                      details: {
                        appid: applicationID,
                        description: FingerPrintDB.games[y].meta_data.description,
                        img: FingerPrintDB.games[y].meta_data.img,
                        name: FingerPrintDB.games[y].name,
                        provider: FingerPrintDB.games[y].search_method,
                        library: chosenLibrary,
                        location: loc,
                        launch_type: "cmd",
                        launch_cmd: tempLaunchDec
                      }
                    });
                    gameListManager(applicationID).then(gameListRes => {
                      resolve("Successfully Saved Other API Settings: "+FingerPrintDB.games[y].name);
                    }).catch(gameListerr => {
                      gameNotifManager("err", "Generic Error on Game List Save: "+gameListerr);
                      reject("Generic Error on game_list save: "+gameListerr);
                    })
                  } catch(err) {
                    console.log("Error saving Other API settings for "+FingerPrintDB.games[y].name+":: Error: "+err);
                    gameNotifManager("err", "Error saving Other API settings for "+FingerPrintDB.games[y].name+":: Error: "+err);
                    reject("Error saving Other API settings for "+FingerPrintDB.games[y].name+":: Error: "+err);
                  }
                  resolve("Successfully Saved This Game ID: "+applicationID + "/"+FingerPrintDB.games[y].name);
                } else {
                  reject("Already Saved This Game ID: "+applicationID +"/"+FingerPrintDB.games[y].name);
                }
              } catch(err) {
                gameNotifManager("err", "Error Checking Saved Status: "+err);
                reject("Error Checking Saved Status: "+err);
              }
            }
          }
        }
      });
    } catch(err) {
      gameNotifManager("err", "Error: During Reading Database: "+err);
      reject("Error: During Reading Database: "+err);
    }
  });
}

function gameListManager(applicationID) {
  return new Promise(function(resolve, reject) {
    //this will be in charge of keeping an up to date list of all games
    //that have been saved via their appID's using the game_list setting.

    //first ensure the setting has been set.
    //which it should since its in ini
    if (settings.hasSync('game_list')) {
      var tempGameCheck = settings.getSync('game_list.list');
      //console.log("tempGameCheck: "+tempGameCheck);
      if ( !tempGameCheck.includes(applicationID) ) {
        //ensure that it has not already been set.
        //then backup current settings.
        var tempList;
        if (settings.getSync('game_list.list') != "") {
          console.log("game_list is not empty: Adding...");
          tempList = settings.getSync('game_list');
          try {
            settings.setSync('game_list', {
              list: tempList.list+","+applicationID
            });
            //console.log("Successfully added to game_list");
            resolve("Successfully added "+applicationID+" to game_list");
          } catch(err) {
            //console.log("Error: Saving game_list settings: "+err);
            gameNotifManager("err", "Error: Saving Game List Settings: "+err);
            reject("Error: Saving game_list settings: "+err);
          }
        } else {
          console.log("game_list is empty: Creating...");
          try {
            settings.setSync('game_list', {
              list: applicationID+""
            });
            //console.log("Successfully added to game_list");
            resolve("Successfully added "+applicationID+" to game_list");
          } catch(err) {
            //console.log("Error: Saving to game_list settings: "+err);
            gameNotifManager("err", "Error: Saving to Game List Settings: "+err);
            reject("Error: Saving game_list settings: "+err);
          }
        }
        //tempList += settings.getSync('game_list.list');
        //try {
        //  settings.setSync('game_list', {
        //    list: tempList.list+","+applicationID,
        //  });
        //  console.log("Successfully added to game_list");
        //  resolve("Successfully added "+applicationID+" to game_list");
        //} catch(err) {
        //  console.log("Error: Saving game_list settings: "+err);
        //  reject("Error: Saving game_list settings: "+err);
        //}
      }
    } else {
      console.log("Error: game_list not set.");
      gameNotifManager("err", "Error: Game List is not set.");
      reject("Error: game_list not set.");
    }
  });
}

function gameNotifManager(type, content) {
  if (type == "create") {
    //this means the gameNotif is being called to create
    //a notification that games are being scanned.
    document.getElementById('alert-overlay').style.backgroundColor = "#66edff";
    document.getElementById('alert-overlay').style.color = "black";
    document.getElementById('alert-overlay').innerText = "Looking for your games";
    document.getElementById('alert-overlay').style.display = "block";
  } else if (type == "err") {
    document.getElementById('alert-overlay').style.backgroundColor = "#700f0f";
    document.getElementById('alert-overlay').style.color = "black";
    document.getElementById('alert-overlay').innerText = content;
    document.getElementById('alert-overlay').style.display = "block";
  } else if (type == "game_scan") {
    document.getElementById('alert-overlay').style.backgroundColor = "#66edff";
    document.getElementById('alert-overlay').style.color = "black";
    document.getElementById('alert-overlay').innerText = "Couldn't find "+content+". Removing it from your library.";
    document.getElementById('alert-overlay').style.display = "block";
  } else if (type == "reset") {
    document.getElementById('alert-overlay').style.backgroundColor = "#3838383";
    document.getElementById('alert-overlay').style.color = "white";
    document.getElementById('alert-overlay').innerText = "Reset Complete. Please Restart the Program.";
    document.getElementById('alert-overlay').style.display = "block";
  }
}

function gameLaunchManager(appid) {
  console.log(appid);
  //this can be used to track recently played games.
  if (settings.hasSync('recently_played')) {
    //ensure it exists.
    let gameList = (settings.getSync('recently_played.list')).split(",");
    if (gameList.length == 1) {
      console.log("Recently Played has no recents, first time add");
      settings.setSync('recently_played', {
        list: appid+","
      });
    } else if (gameList.length <= 5 && gameList.length != 1) {
      //if its smaller than 5 or the default value.
      console.log("Recenlty Played is under 5, adding");
      settings.setSync('recently_played', {
        list: gameList+appid+","
      });
      //if shorter then add the currently launched game.
    } else {
      console.log("Recently Played reached its limit, staying at limit");
      //if longer or equal, remove the oldest item,
      let post_removed_item = gameList.splice(0, 1);  //remove the first or earlist item
      settings.setSync('recently_played', {
        list: gameList+appid+","
      });
      //then just save this value as the first.
    }
  } else {
    console.log("Recently Played list doesn't exist.");
    gameNotifManager("err", "Recently Played list doesn't exist.");
  }
}

function removeEpicGamesData(areYouSure) {
  //this is used to permentantly delete all Epic Games data.
  if (areYouSure == "true") {
    try {
      var allLibraries = settings.getSync('SavedLibraries.fullList');
      for (let i = 0; i < allLibraries.length; i++) {
        if (allLibraries[i].contains("Epic") || allLibraries[i].contains("epic")) {
          //now with a library we can use that to find its corrosponding Ids
          try {

          } catch(err) {

          }
          console.log("Permentantly Deleting Game Library Entry: "+allLibraries[i]);
          settings.unsetSync(allLibraries[i]);

        }
      }
    } catch(err) {
      console.log("Unable to Find Library File. You may need to delete data manually. Error: "+err);
    }
  }
}

function resetSettings() {
  console.log("Reset settings...");
  try {
    settings.unset('last_game_scan');
    settings.unset('recently_played');
    settings.unset('last_game_search');
    settings.unset('db_version');
    settings.unset('discordLink');
    gameNotifManager("reset", "");
  } catch(err) {
    console.log("An Error occured while Resetting Settings: "+err);
    gameNotifManager("err", "An Error occured while Resetting Settings: "+err);
  }
}

function factoryReset() {
  console.log("Full Factory Reset...");
  try {
    settings.unset();
    gameNotifManager("reset", "");
  } catch(err) {
    console.log("An Error occured while Factory Resetting: "+err);
    gameNotifManager("err", "An Error occured while Factory Resetting: "+err);
  }
}
