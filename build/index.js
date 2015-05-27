'use strict';

var _asyncToGenerator = require('babel-runtime/helpers/async-to-generator')['default'];

var _Promise = require('babel-runtime/core-js/promise')['default'];

var apiCallAsync = _asyncToGenerator(function* (method, params) {
  var url = _apiUrl(method, params);
  console.log('Spotify API call:', url);
  var response = yield request.promise.get(url);
  try {
    return JSON.parse(response.body);
  } catch (e) {
    return null;
  }
});

var artistIdAsync = _asyncToGenerator(function* (artistName) {
  var result = yield apiCallAsync('search', {
    q: artistName,
    type: 'artist',
    market: MARKET,
    limit: 1,
    offset: 0 });

  if (result && result.artists && result.artists.items && result.artists.items[0]) {
    return result.artists.items[0].id;
  }
});

var allAlbumIdsAsync = _asyncToGenerator(function* (artistId) {
  var result = yield apiCallAsync('artists/' + artistId + '/albums', {
    market: MARKET,
    limit: 50,
    offset: 0 });

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
});

var allTracksFromAlbumIdsAsync = _asyncToGenerator(function* (albumIds) {
  var segments = segment(albumIds, 20);

  var awaitables = [];
  for (var s of segments) {
    awaitables.push(apiCallAsync('albums', {
      ids: s.join(',') }));
  }

  var results = yield _Promise.all(awaitables);

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
});

var popularTracksByArtistAsync = _asyncToGenerator(function* (artistName) {
  var artistId = yield artistIdAsync(artistName);
  var albumIds = yield allAlbumIdsAsync(artistId);
  var tracks = yield allTracksFromAlbumIdsAsync(albumIds);
  var popularTracks = _.sortBy(tracks, 'popularity');
  popularTracks.reverse();
  return popularTracks;
});

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

function segment(list, step) {
  var x = [];
  for (var i = 0; i < list.length; i += step) {
    x.push(list.slice(i, i + step));
  }
  return x;
}

function escape(text) {
  if (text == null) {
    return '';
  } else {
    return text.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
}

var formHtml = `
<form onsubmit="window.location = ('/tracks/' + encodeURIComponent(document.getElementById('artistName').value)); return false;">
  <input type="text" id="artistName" />
  <input type="submit" value=" See Top Tracks " />
</form>
`;

function htmlForTracks(tracks) {
  var fields = ['id', 'popularity', 'name', 'uri'];
  var html = '<style>BODY { font-family: Helvetica; font-size: 10pt; }</style>' + formHtml + '<table><tr><th>#</th>';
  for (var f of fields) {
    html += '<th>' + f + '</th>';
  }
  html += '</tr>';

  var n = 0;
  for (var t of tracks) {
    html += '<tr>';
    n++;
    html += '<td>' + n + '</td>';
    for (var f of fields) {
      var x = t[f];
      if (_.isString(x) && x.match(/^[a-z]+:/)) {
        var val = '<a href="' + x + '">#' + x + '</a>';
      } else {
        val = escape(x);
      }
      html += '<td>' + val + '</td>';
    }
    html += '</tr>';
  }
  html += '</table>';

  return html;
}

if (require.main === module) {
  var app = express();
  app.get('/tracks/:artistName', function (req, res) {
    console.log('artistName=', req.params.artistName);
    popularTracksByArtistAsync(req.params.artistName).then(function (tracks) {
      console.log('aristName=', req.params.artistName, 'tracks.length=', tracks.length);
      res.send(htmlForTracks(tracks));
    }, function (err) {
      console.error('Failed: ' + err.message);
    });
  });
  app.get('/', function (req, res) {
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
  var server = app.listen(3000, function () {
    var host = server.address().address;
    var port = server.address().port;
    console.log('Top tracks app listening at http://' + host + ':' + port);
  });
}

module.exports = {
  apiCallAsync: apiCallAsync,
  artistIdAsync: artistIdAsync,
  allAlbumIdsAsync: allAlbumIdsAsync,
  allTracksFromAlbumIdsAsync: allTracksFromAlbumIdsAsync,
  popularTracksByArtistAsync: popularTracksByArtistAsync,
  htmlForTracks: htmlForTracks,
  escape: escape };
//# sourceMappingURL=sourcemaps/index.js.map