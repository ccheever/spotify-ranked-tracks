var _ = require('lodash-node');
var express = require('express');
var instapromise = require('instapromise');
var request = require('request');

var MARKET = 'US';

function _apiUrl(method, params) {
  var host = 'api.spotify.com';
  var version = 'v1';
  var paramList = [];
  for (var key in params) {
    var val = params[key];
    paramList.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
  }
  return 'https://' + host + '/' + version + '/' + method + '?' + paramList.join('&');
}

async function apiCallAsync(method, params) {
  var url = _apiUrl(method, params);
  console.log("Spotify API call:", url);
  var response = await request.promise.get(url);
  try {
    return JSON.parse(response.body);
  } catch (e) {
    return null;
  }
}

async function artistIdAsync(artistName) {
  var result = await apiCallAsync('search', {
    q: artistName,
    type: 'artist',
    market: MARKET,
    limit: 1,
    offset: 0,
  });

  if (result && result.artists && result.artists.items && result.artists.items[0]) {
    return result.artists.items[0].id;
  }

}

async function allAlbumIdsAsync(artistId) {
  var result = await apiCallAsync('artists/' + artistId + '/albums', {
    market: MARKET,
    limit: 50,
    offset: 0,
  });

  var albums = result.items;

  if (albums) {
    var albumIds = [];
    for (var a of albums) {
      albumIds.push(a.id);
    }
    return albumIds;
  } else {
    return [];
  }
}

function segment(list, step) {
  var x = [];
  for (var i = 0; i < list.length; i += step) {
    x.push(list.slice(i, i + step));
  }
  return x;
}

async function allTracksFromAlbumIdsAsync(albumIds) {
  var segments = segment(albumIds, 20);

  var awaitables = [];
  for (var s of segments) {
    awaitables.push(apiCallAsync('albums', {
      ids: s.join(','),
    }));
  }

  var results = await Promise.all(awaitables);

  var tracks = [];
  for (var r of results) {
    var albums = r.albums;
    for (var a of albums) {
      for (var t of a.tracks.items) {
        tracks.push(t);
      }
    }
  }
  return tracks;
}

async function infoForTracksAsync(trackIds) {
  let segments = segment(trackIds, 50);

  let awaitables = [];
  for (let s of segments) {
    awaitables.push(apiCallAsync('tracks', {
      ids: s.join(','),
    }));
  }

  let results = await Promise.all(awaitables);
  let trackInfos = [];
  for (let r of results) {
    let tracks = r.tracks;
    for (let t of tracks) {
      trackInfos.push(t);
    }
  }
  return trackInfos;
}

function filterTrackInfoToJustArtist(trackInfos, artistId) {
  let result = [];
  for (let t of trackInfos) {
    let include = false;
    for (let a of t.artists) {
      if (a.id === artistId) {
        include = true;
        break;
      }
    }
    if (include) {
      result.push(t);
    }
  }
  return result;
}

async function popularTracksByArtistAsync(artistName) {
  var artistId = await artistIdAsync(artistName);
  var albumIds = await allAlbumIdsAsync(artistId);
  var tracks = await allTracksFromAlbumIdsAsync(albumIds);
  let trackIds = tracks.map((t) => t.id);
  let trackInfos = await infoForTracksAsync(trackIds);
  let filteredTrackInfos = filterTrackInfoToJustArtist(trackInfos, artistId);
  var popularTracks = _.sortBy(filteredTrackInfos, 'popularity');
  popularTracks.reverse();
  return popularTracks;
}

function escape(text) {
  if (text == null) {
    return '';
  } else {
    return text
      .toString()
      .replace(/&/g,'&amp;' )
      .replace(/</g,'&lt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#039;')
      ;
  }
}

var formHtml = `
<form onsubmit="window.location = ('/tracks/' + encodeURIComponent(document.getElementById('artistName').value)); return false;">
  <input type="text" id="artistName" />
  <input type="submit" value=" See Top Tracks " />
</form>
`;


function htmlForTracks(tracks) {
  var fields = ['id', 'popularity', 'name', 'albumName', 'uri'];
  tracks = tracks.map((t) => Object.assign(t, {albumName: t.album.name}));
  var html = "<style>BODY { font-family: Helvetica; font-size: 10pt; }</style>" + formHtml + "<table><tr><th>#</th>";
  for (var f of fields) {
    html += "<th>" + f + "</th>";
  }
  html += "</tr>";

  var n = 0;
  for (var t of tracks) {
    html += "<tr>";
    n++;
    html += "<td>" + n + "</td>";
    for (var f of fields) {
      var x = t[f];
      if (_.isString(x) && x.match(/^[a-z]+:/)) {
        var val = '<a href="' + x + '">#' + x + '</a>';
      } else {
        val = escape(x);
      }
      html += "<td>" + val + "</td>";
    }
    html += "</tr>";

  }
  html += "</table>";

  return html;

}


if (require.main === module) {
  var app = express();
  app.get('/tracks/:artistName', (req, res) => {
    console.log("artistName=", req.params.artistName);
    popularTracksByArtistAsync(req.params.artistName).then((tracks) => {
      console.log("aristName=", req.params.artistName, "tracks.length=", tracks.length);
      res.send(htmlForTracks(tracks));
    }, (err) => {
      console.error("Failed: " + err.message);
    });
  });
  app.get('/', (req, res) => {
    res.send(`
<html>
  <head>
    <title>Spotify Top Tracks</title>
  </head>
  <body>` + formHtml + `
  </body>
</html>
    `);
  });
  var server = app.listen(3000, () => {
    var host = server.address().address;
    var port = server.address().port;
    console.log("Top tracks app listening at http://" + host + ":" + port);
  });
}

module.exports = {
  apiCallAsync,
  artistIdAsync,
  allAlbumIdsAsync,
  allTracksFromAlbumIdsAsync,
  infoForTracksAsync,
  popularTracksByArtistAsync,
  htmlForTracks,
  escape,
};
