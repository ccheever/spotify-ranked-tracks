express = require 'express'
fibrous = require 'use-global-fibrous'
request = require 'request'
{
  pluck
  sortBy
} = require 'lodash-node'

_apiUrl = (method, params) ->
  """The URL for an API call"""

  host = "api.spotify.com"
  version = "v1"
  paramList = []
  for key, val of params
    paramList.push "#{ encodeURIComponent key }=#{ encodeURIComponent val }"

  """https://#{ host }/#{ version }/#{ method }?#{ paramList.join '&' }"""

apiCall = fibrous (method, params) ->
  """Calls Spotify's API"""

  url = _apiUrl method, params
  response = request.sync url
  try
    JSON.parse response.body
  catch
    null


artistId = fibrous (artistName) ->
  """Gets a Spotify artistId from a search query for artist name"""

  # https://api.spotify.com/v1/search?q=Ryan+Adams&type=artist&market=US&limit=1&offset=0

  result = apiCall.sync 'search',
    q: artistName
    type: 'artist'
    market: 'US'
    limit: 1
    offset: 0

  result?.artists?.items?[0]?.id

allAlbumIds = fibrous (artistId) ->
  """Gets all the albums on Spotify of a given artist"""

  # https://api.spotify.com/v1/artists/2qc41rNTtdLK0tV3mJn2Pm/albums?market=US&limit=50&offset=0

  result = apiCall.sync "artists/#{ artistId }/albums",
    market: 'US'
    limit: 50
    offset: 0

  albums = result?.items

  if albums?
    (a.id for a in albums)
  else
    []

segment = (list, step) ->
  """Segments a list of things into a series of lists of length at most `step`"""

  (list[offset...offset + step] for offset in (i for i in [0...list.length] by step))


allTracksFromAlbumIds = fibrous (albumIds) ->
  """Gets all the track ids from a bunch of albumIds"""

  segments = segment albumIds, 20

  futures = []
  for s in segments

    # https://api.spotify.com/v1/albums?ids=6JNlf8swWaLPW6PpQA9ghW,5FV8d3DhSoArvwr0Qqgzq3,6R2ec7b25hSZrF19oj3yRG

    futures.push apiCall.future 'albums',
      ids: s.join ','

  trackIds = (x.id for x in Array::concat (t for t in Array::concat(((a?.tracks?.items for a in b?.albums) for b in fibrous.wait futures)...))...)

  segments = segment trackIds, 50

  futures = []
  for s in segments
    futures.push apiCall.future 'tracks',
      ids: s.join ','

  tracks = ({
    id: t.id
    name: t.name
    href: t.href
    uri: t.uri
    popularity: t.popularity
    } for t in Array::concat (x?.tracks for x in fibrous.wait futures)...)

  popularTracks = sortBy tracks, 'popularity'
  popularTracks.reverse()

popularTracksByArtist = fibrous (artistName) ->
  """Given an artist name, list all their tracks"""

  _artistId = artistId.sync artistName
  albumIds = allAlbumIds.sync _artistId
  allTracksFromAlbumIds.sync albumIds

_escape = (text) ->
  """HTML escape"""
  text.toString().replace(/&/g,'&amp;' ).replace(/</g,'&lt;').
      replace(/"/g,'&quot;').replace(/'/g,'&#039;')

htmlForTracks = (tracks) ->
  """Returns HTML for a bunch of tracks"""

  fields = ['id', 'popularity', 'name', 'uri']
  html = "<style>BODY { font-family: Monaco; font-size: 10pt; }</style><table><tr><th>#</th>"
  for f in fields
    html += "<th>#{ f }</th>"
  html += "</tr>"

  n = 0
  for t in tracks
    html += "<tr>"
    n++
    html += "<td>#{ n }</td>"
    for f in fields
      x = t[f]
      if ':' in x
        val = """<a href="#{ x }">#{ x }</a>"""
      else
        val = _escape x
      html += "<td>#{ val }</td>"
    html += "</tr>"

  html += "</table>"

if require.main is module
  app = express()
  app.get '/', (req, res) ->
    res.send "Hello world!"

  app.get "/tracks/:artistName", (req, res) ->
    fibrous.run ->
      tracks = popularTracksByArtist.sync req.params.artistName
      res.send htmlForTracks tracks

  server = app.listen 3000, ->
    host = server.address().address
    port = server.address().port
    console.log "Top tracks app listening at http://%s:%s", host, port


module.exports = {
  htmlForTracks
  popularTracksByArtist
  allTracksFromAlbumIds
  allAlbumIds
  artistId
  apiCall
  _apiUrl
}
