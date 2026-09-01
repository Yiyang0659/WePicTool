var STICKERS = Array.from({ length: 12 }, function (_, index) {
  return {
    key: 'sticker_' + index,
    type: 'sticker',
    source: 'project-owned',
    renderer: 'procedural-v1'
  };
});

var DOODLE_KEYS = [
  'arrow-curve', 'heart-outline', 'circle-mark', 'underline-rough', 'scribble-cross', 'burst-lines'
];

var DOODLES = DOODLE_KEYS.map(function (key) {
  return {
    key: key,
    type: 'doodle',
    source: 'project-owned',
    renderer: 'procedural-v1'
  };
});

var ASSETS = STICKERS.concat(DOODLES);

function getAsset(key) {
  return ASSETS.find(function (asset) { return asset.key === key; }) || null;
}

function listAssets() {
  return ASSETS.slice();
}

module.exports = {
  ASSETS: ASSETS,
  getAsset: getAsset,
  listAssets: listAssets
};
