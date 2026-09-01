const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadMiniProgramModule(relativePath, dependencies = {}) {
  const filePath = path.join(__dirname, '..', '..', relativePath);
  const code = fs.readFileSync(filePath, 'utf8');
  const module = { exports: {} };
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) {
      return dependencies[request];
    }
    return require(request);
  };

  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: localRequire,
    console
  }, { filename: filePath });
  return module.exports;
}

function loadMiniProgramPage(relativePath, dependencies = {}, wxOverrides = {}) {
  const filePath = path.join(__dirname, '..', '..', relativePath);
  const code = fs.readFileSync(filePath, 'utf8');
  let definition = null;
  const localRequire = (request) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) {
      return dependencies[request];
    }
    return require(request);
  };

  vm.runInNewContext(code, {
    Page(value) { definition = value; },
    require: localRequire,
    wx: wxOverrides,
    getApp() { return { globalData: {} }; },
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise
  }, { filename: filePath });
  return definition;
}

function instantiatePage(definition) {
  const instance = Object.assign({}, definition);
  instance.data = plain(definition.data || {});
  instance.setData = function (updates) {
    Object.keys(updates || {}).forEach((key) => {
      instance.data[key] = updates[key];
    });
  };
  return instance;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  loadMiniProgramModule,
  loadMiniProgramPage,
  instantiatePage,
  plain
};
