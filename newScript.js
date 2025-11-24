let currentSong = new Audio();
let songs = [];
let playHistory = [];
let favoriteSongs = [];
let songNames = [];
let sessionStart = Date.now();
let sessionListeningTime = 0;
let lastPlayTimestamp = null;
let songsInLocalStorage = [
  "http://127.0.0.1:5501/songs/All%20The%20Stars%20-%20Kendrick%20Lamar.mp3",
];
let songQueue = [];
let sleepTimeout = null;

// --- Fetch Songs ---
async function getSongs() {
  let response = await fetch("http://127.0.0.1:5501/songs/");
  let html = await response.text();
  let div = document.createElement("div");
  div.innerHTML = html;
  let as = div.getElementsByTagName("a");
  let songList = [];
  for (let i = 0; i < as.length; i++) {
    let href = as[i].href;
    if (href.endsWith(".mp3") || href.endsWith(".m4a") || href.endsWith(".wav")) {
      songList.push(href);
    }
  }
  return songList;
}

// --- Utility Functions ---
function secondsToMinutesSeconds(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(
    remainingSeconds
  ).padStart(2, "0")}`;
}
function cleanUpSongTitle(title) {
  return title
    .replace(/^.*\/songs\//, "")
    .replace(/%20/g, " ")
    .replace(/\.mp3$/, "")
    .replace(/\.m4a$/, "")
    .replace(/\.wav$/, "");
}

// --- Recently Played ---
let recentlyPlayed = JSON.parse(localStorage.getItem("recentlyPlayed") || "[]");
function updateRecentSongList() {
  const recentList = document.getElementById("recentSongList");
  if (!recentList) return;
  if (recentlyPlayed.length === 0) {
    recentList.innerHTML = "<li>No songs played yet</li>";
    return;
  }
  recentList.innerHTML = "";
  recentlyPlayed.forEach((song) => {
    const li = document.createElement("li");
    li.textContent = cleanUpSongTitle(song);
    recentList.appendChild(li);
  });
}
function addToRecentlyPlayed(song) {
  recentlyPlayed = recentlyPlayed.filter((s) => s !== song);
  recentlyPlayed.unshift(song);
  if (recentlyPlayed.length > 10) recentlyPlayed.pop();
  localStorage.setItem("recentlyPlayed", JSON.stringify(recentlyPlayed));
  updateRecentSongList();
}
function clearRecentlyPlayed() {
  recentlyPlayed = [];
  localStorage.setItem("recentlyPlayed", JSON.stringify(recentlyPlayed));
  updateRecentSongList();
}

// --- Usage History ---
function onSongPlay() {
  lastPlayTimestamp = Date.now();
}
function onSongPauseOrEnd() {
  if (lastPlayTimestamp) {
    sessionListeningTime += Date.now() - lastPlayTimestamp;
    lastPlayTimestamp = null;
  }
}
function saveUsageHistory() {
  onSongPauseOrEnd();
  let usageHistory = JSON.parse(localStorage.getItem("usageHistory") || "[]");
  const now = new Date();
  const sessionData = {
    date: now.toLocaleString(),
    hours: +(sessionListeningTime / (1000 * 60 * 60)).toFixed(2),
  };
  usageHistory.push(sessionData);
  if (usageHistory.length > 5) usageHistory = usageHistory.slice(-5);
  localStorage.setItem("usageHistory", JSON.stringify(usageHistory));
  renderUsageHistory();
}
function renderUsageHistory() {
  const usageHistory = JSON.parse(localStorage.getItem("usageHistory") || "[]");
  const list = document.getElementById("usageHistoryList");
  if (!list) return;
  list.innerHTML = "";
  if (usageHistory.length === 0) {
    list.innerHTML = "<li>No usage data yet</li>";
    return;
  }
  usageHistory.forEach((session) => {
    const li = document.createElement("li");
    li.textContent = `Date: ${session.date} | Hours listened: ${session.hours}`;
    list.appendChild(li);
  });
}
renderUsageHistory();

// --- Player State ---
function savePlayerState() {
  localStorage.setItem("lastPlayedSong", currentSong.src);
  localStorage.setItem("lastVolume", currentSong.volume);
}
function restorePlayerState(songs) {
  const lastSong = localStorage.getItem("lastPlayedSong");
  const lastVolume = localStorage.getItem("lastVolume");
  if (lastVolume !== null) {
    currentSong.volume = parseFloat(lastVolume);
    document.querySelector(".range input").value = Math.round(
      currentSong.volume * 100
    );
  }
  if (lastSong && songs.includes(lastSong)) {
    currentSong.src = lastSong;
    updateSongInfo(lastSong);
    addToRecentlyPlayed(lastSong);
  } else {
    currentSong.src = songs[0];
    updateSongInfo(songs[0]);
    addToRecentlyPlayed(songs[0]);
  }
}

// --- Main Player Logic ---
function updateSongInfo(song) {
  document.querySelector(".songinfo").innerHTML = cleanUpSongTitle(song);
  // Download link
  document.getElementById("downloadBtn").href = song;
  // Show lyrics
  showLyrics(song);
}
function albumArt(song) {
  let artName = cleanUpSongTitle(song).trim() + ".jpg";
  let artPath = "albumart/" + artName;
  let albumArtImg = document.getElementById("albumArt");
  albumArtImg.onerror = function () {
    this.src = "img/10595559.jpg";
  };
  albumArtImg.src = artPath;
}
let lastSong = localStorage.getItem("lastPlayedSong");
if (lastSong) {
  albumArt(lastSong);
}
function playMusic(track) {
  currentSong.src = track;
  playHistory.push(track);
  document.querySelector("#playButton").src = "svg/pause.svg";
  updateSongInfo(track);
  document.querySelector(".songtime").innerHTML = "00:00 / 00:00";
  albumArt(track);
  addToRecentlyPlayed(track);
  currentSong.play().catch(() => { });
  savePlayerState();
}

// --- Lyrics Display ---
async function showLyrics(song) {
  const lyricsBox = document.getElementById("lyricsBox");
  const songTitle = cleanUpSongTitle(song);
  try {
    let res = await fetch(`lyrics/${songTitle}.txt`);
    if (res.ok) {
      lyricsBox.textContent = await res.text();
    } else {
      lyricsBox.textContent = "Lyrics not found.";
    }
  } catch {
    lyricsBox.textContent = "Lyrics not found.";
  }
}

// --- Audio Visualization ---
const canvas = document.getElementById("visualizer");
const ctx = canvas.getContext("2d");
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioCtx.createAnalyser();
const source = audioCtx.createMediaElementSource(currentSong);
source.connect(analyser);
analyser.connect(audioCtx.destination);

function drawVisualizer() {
  requestAnimationFrame(drawVisualizer);
  let dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 50; i++) {
    let barHeight = dataArray[i];
    ctx.fillStyle = "#1db954";
    ctx.fillRect(i * 8, canvas.height - barHeight / 2, 6, barHeight / 2);
  }
}
currentSong.onplay = () => {
  audioCtx.resume();
  drawVisualizer();
};

// --- Queue System ---
function addToQueue(song) {
  songQueue.push(song);
  showToast("Added to queue");
}
function playNextInQueue() {
  if (songQueue.length) {
    playMusic(songQueue.shift());
  } else {
    playNextSong();
  }
}

// --- Playlist Feature ---
let playlists = JSON.parse(localStorage.getItem("playlists") || "{}");
function renderPlaylists() {
  const ul = document.getElementById("playlistList");
  const select = document.getElementById("playlistSelect");
  ul.innerHTML = "";
  select.innerHTML = '<option value="">Select playlist</option>';
  Object.keys(playlists).forEach((name) => {
    // List for viewing/playing
    const li = document.createElement("li");
    li.textContent = name;
    li.style.cursor = "pointer";
    li.onclick = () => {
      songs = playlists[name]; // <-- Set global songs array to playlist songs
      renderSongList(songs, document.querySelector(".songLists ul"));
      setupSongListEvents(document.querySelector(".songLists ul"));
      showToast("Showing playlist: " + name);
    };
    ul.appendChild(li);

    // Dropdown for adding songs
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}
document.getElementById("createPlaylistBtn").onclick = () => {
  const name = document.getElementById("playlistName").value.trim();
  if (name && !playlists[name]) {
    playlists[name] = [];
    localStorage.setItem("playlists", JSON.stringify(playlists));
    renderPlaylists();
    showToast("Playlist created: " + name);
  } else if (playlists[name]) {
    showToast("Playlist already exists!");
  }
  document.getElementById("playlistName").value = "";
};
document.getElementById("addToPlaylistBtn").onclick = () => {
  const playlistName = document.getElementById("playlistSelect").value;
  if (!playlistName) {
    showToast("Select a playlist first!");
    return;
  }
  if (!currentSong.src) {
    showToast("No song is playing!");
    return;
  }
  if (!playlists[playlistName].includes(currentSong.src)) {
    playlists[playlistName].push(currentSong.src);
    localStorage.setItem("playlists", JSON.stringify(playlists));
    showToast("Added to playlist: " + playlistName);
  } else {
    showToast("Song already in playlist!");
  }
};
renderPlaylists();

// --- Song Upload ---
document.getElementById("uploadSong").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    songs.push(url);
    renderSongList(songs, document.querySelector(".songLists ul"));
    setupSongListEvents(document.querySelector(".songLists ul"));
    showToast("Song uploaded (local only)");
  }
});

// --- Sleep Timer ---
document.getElementById("setSleepBtn").onclick = function () {
  if (sleepTimeout) clearTimeout(sleepTimeout);
  let mins = parseInt(document.getElementById("sleepMinutes").value);
  if (mins > 0) {
    sleepTimeout = setTimeout(() => {
      currentSong.pause();
      showToast("Sleep timer: Music stopped");
    }, mins * 60000);
    showToast("Sleep timer set for " + mins + " min");
  }
};

// --- Song List Rendering ---
function renderSongList(songList, ulElement, hoverClass = "") {
  ulElement.innerHTML = "";
  for (const song of songList) {
    const cleanedSongTitle = cleanUpSongTitle(song);
    ulElement.innerHTML += `
            <li data-song="${song}" class="${hoverClass}">
                <img class="convert" src="svg/music.svg" alt="img">
                <div class="info">
                    <div>${cleanedSongTitle}</div>
                </div>
                <div class="playnow">
                    <img class="invert" src="svg/play.svg" alt="">
                </div>
                <button onclick="addToQueue('${song}')">Queue</button>
            </li>
        `;
  }
}
function setupSongListEvents(songUl) {
  songUl.querySelectorAll("li").forEach((li) => {
    li.onclick = (e) => {
      // Prevent queue button click from triggering play
      if (e.target.tagName === "BUTTON") return;
      playMusic(li.dataset.song);
    };
  });
}

// --- Main ---
async function main() {
  songs = await getSongs();
  if (!songs.length) {
    console.log("No songs found");
    return;
  }

  const playButton = document.querySelector("#playButton");
  const songUl = document.querySelector(".songLists ul");
  const rangeInput = document.querySelector(".range input");
  const loopButton = document.getElementById("loopButton");
  const favbtn = document.querySelector(".favbtn");
  const fav = document.querySelector(".fav");
  const library = document.querySelector(".library");
  const resetBtn = document.querySelector(".reset");
  const shuffleBtn = document.getElementById("shuffleButton");
  const clearRecentBtn = document.getElementById("clearRecentButton");
  let searchBox = document.querySelector("#searchInput");
  let searchBtn = document.querySelector("#searchButton");

  searchBtn.addEventListener("click", () => {
    let val = searchBox.value.trim().toLowerCase();
    let idx = songs.findIndex((song) =>
      cleanUpSongTitle(song).toLowerCase().includes(val)
    );
    if (idx !== -1) {
      playMusic(songs[idx]);
      searchBox.value = "";
      showToast("Playing: " + cleanUpSongTitle(songs[idx]));
    } else {
      showToast("Song not found!");
    }
  });

  // Prepare song names for localStorage
  songNames = songs.map((e) =>
    decodeURIComponent(
      e
        .replace("http://127.0.0.1:5501/songs/", "")
        .replace(".mp3", "")
        .replace(".m4a", "")
        .replace(".wav", "")
    )
  );

  // Render initial song list
  renderSongList(songs, songUl);

  // Restore last played song and volume
  restorePlayerState(songs);

  // Set up events
  setupSongListEvents(songUl);

  playButton.addEventListener("click", () => {
    if (currentSong.paused) {
      currentSong.play();
      playButton.src = "svg/pause.svg";
    } else {
      currentSong.pause();
      playButton.src = "svg/play.svg";
    }
    savePlayerState();
  });

  document.getElementById("previous").addEventListener("click", () => {
    playPreviousSong();
    savePlayerState();
  });
  document.getElementById("next").addEventListener("click", () => {
    playNextSong();
    savePlayerState();
  });

  if (shuffleBtn) {
    shuffleBtn.addEventListener("click", () => {
      shuffleSongs();
      setupSongListEvents(songUl);
    });
  }

  if (clearRecentBtn) {
    clearRecentBtn.addEventListener("click", clearRecentlyPlayed);
  }

  rangeInput.value = Math.round(currentSong.volume * 100);
  rangeInput.addEventListener("change", function (event) {
    currentSong.volume = parseFloat(event.target.value) / 100;
    savePlayerState();
  });

  document.querySelector(".seekbar").addEventListener("click", function (e) {
    const percent = (e.offsetX / e.target.getBoundingClientRect().width) * 100;
    document.querySelector(".circle").style.left = percent + "%";
    currentSong.currentTime = (currentSong.duration * percent) / 100;
  });

  window.addEventListener("keydown", function (e) {
    switch (e.key) {
      case "Enter":
        playNextSong();
        break;
      case "Shift":
        playPreviousSong();
        break;
      case " ": // Space
        if (currentSong.paused) {
          currentSong.play();
          playButton.src = "svg/pause.svg";
        } else {
          currentSong.pause();
          playButton.src = "svg/play.svg";
        }
        savePlayerState();
        break;
      case "ArrowRight":
        currentSong.currentTime++;
        break;
      case "ArrowLeft":
        currentSong.currentTime--;
        break;
      case "ArrowUp":
        if (currentSong.volume < 1) {
          currentSong.volume += 0.01;
          rangeInput.value = Math.round(currentSong.volume * 100);
        }
        break;
      case "ArrowDown":
        if (currentSong.volume > 0.01) {
          currentSong.volume -= 0.01;
          rangeInput.value = Math.round(currentSong.volume * 100);
        }
        break;
      case "l":
        loopButton.click();
        break;
    }
  });

  currentSong.addEventListener("timeupdate", () => {
    document.querySelector(".songtime").innerHTML = `${secondsToMinutesSeconds(
      currentSong.currentTime
    )}/${secondsToMinutesSeconds(currentSong.duration)}`;
    document.querySelector(".circle").style.left =
      (currentSong.currentTime / currentSong.duration) * 100 + "%";
  });

  currentSong.addEventListener("ended", () => {
    playNextInQueue();
    savePlayerState();
  });

  // Loop button
  loopButton.addEventListener("click", () => {
    currentSong.loop = !currentSong.loop;
    loopButton.classList.toggle("active", currentSong.loop);
    localStorage.setItem("loop", currentSong.loop ? "true" : "false");
  });
  const isLoop = localStorage.getItem("loop") === "true";
  currentSong.loop = isLoop;
  loopButton.classList.toggle("active", isLoop);

  // Random quote
  function updateRandomQuote() {
    fetch("file/data.text")
      .then((response) => response.text())
      .then((data) => {
        const sentences = data.split("\n");
        const randomSentence =
          sentences[Math.floor(Math.random() * sentences.length)];
        document.getElementById("randomTextMarquee").textContent =
          randomSentence;
      })
      .catch((error) => console.error("Error fetching data:", error));
  }
  updateRandomQuote();
  document
    .getElementById("randomTextMarquee")
    .addEventListener("animationiteration", updateRandomQuote);

  // Favorite logic
  fav.addEventListener("click", handleFavoriteClick);

  favbtn.addEventListener("click", () => {
    favbtn.classList.toggle("Clickedfav");
    if (favbtn.classList.contains("Clickedfav")) {
      fav.style.display = "none";
      updateFavoritesList(songUl);
      setupSongListEvents(songUl);
      setupRemoveFromFavEvents(songUl);
      if (currentSong.paused) {
        currentSong.play();
        playButton.src = "svg/pause.svg";
      } else {
        currentSong.pause();
        playButton.src = "svg/play.svg";
      }
    }
  });

  library.addEventListener("mouseover", () => {
    if (favbtn.classList.contains("Clickedfav")) {
      setupSongListEvents(songUl);
      setupRemoveFromFavEvents(songUl);
    }
  });

  // Back to All Songs button handler
  document.getElementById("showAllSongsBtn").onclick = async function () {
    const allSongs = await getSongs();
    songs = allSongs;
    renderSongList(songs, songUl);
    setupSongListEvents(songUl);
    showToast("Showing all songs");
  };

  // Save usage history on page unload
  window.addEventListener("beforeunload", saveUsageHistory);

  // Render usage history on page load
  document.addEventListener("DOMContentLoaded", renderUsageHistory);

  // Show recently played on load
  updateRecentSongList();
}

currentSong.addEventListener("play", onSongPlay);
currentSong.addEventListener("pause", () => {
  onSongPauseOrEnd();
  saveUsageHistory();
});
currentSong.addEventListener("ended", () => {
  onSongPauseOrEnd();
  saveUsageHistory();
});

setInterval(saveUsageHistory, 60000);

main();

// --- Toast Notification ---
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 2000);
}

function handleFavoriteClick() {
  if (!favoriteSongs.includes(currentSong.src)) {
    favoriteSongs.push(currentSong.src);
    showToast("Added to favorites!");
    // Optionally, save to localStorage or update UI here
  } else {
    showToast("Already in favorites!");
  }
}

function playNextSong() {
  const currentIndex = songs.indexOf(currentSong.src);
  let nextIndex = currentIndex + 1;
  if (nextIndex >= songs.length) nextIndex = 0;
  playMusic(songs[nextIndex]);
}

function playPreviousSong() {
  const currentIndex = songs.indexOf(currentSong.src);
  let prevIndex = currentIndex - 1;
  if (prevIndex < 0) prevIndex = songs.length - 1;
  playMusic(songs[prevIndex]);
}

function updateFavoritesList(songUl) {
  // Show only favorite songs in the song list
  if (!favoriteSongs.length) {
    songUl.innerHTML = "<li>No favorites yet</li>";
    return;
  }
  songUl.innerHTML = "";
  favoriteSongs.forEach((song) => {
    const cleanedSongTitle = cleanUpSongTitle(song);
    songUl.innerHTML += `
            <li data-song="${song}">
                <img class="remove-fav" src="svg/heart.svg" alt="Remove from favorites" title="Remove from favorites" style="width:20px;cursor:pointer;">
                <div class="info">
                    <div>${cleanedSongTitle}</div>
                </div>
                <div class="playnow">
                    <img class="invert" src="svg/play.svg" alt="">
                </div>
            </li>
        `;
  });
}

function setupRemoveFromFavEvents(songUl) {
  // Add click event to remove from favorites
  songUl.querySelectorAll(".remove-fav").forEach((img) => {
    img.onclick = function (e) {
      e.stopPropagation();
      const li = e.target.closest("li");
      const song = li.getAttribute("data-song");
      const idx = favoriteSongs.indexOf(song);
      if (idx !== -1) {
        favoriteSongs.splice(idx, 1);
        showToast("Removed from favorites!");
        updateFavoritesList(songUl);
        setupRemoveFromFavEvents(songUl);
      }
    };
  });
}

const speedControl = document.getElementById("speedControl");
if (speedControl) {
  speedControl.addEventListener("change", function () {
    currentSong.playbackRate = parseFloat(this.value);
    showToast("Speed: " + this.value + "x");
  });
}
currentSong.addEventListener("play", () => {
  if (speedControl) {
    currentSong.playbackRate = parseFloat(speedControl.value);
  }
});
