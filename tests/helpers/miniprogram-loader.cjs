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

function setNestedValue(target, keyPath, value) {
  const parts = keyPath.replace(/\[(\w+)\]/g, '.$1').split('.');
  let current = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

function instantiatePage(definition) {
  const instance = Object.assign({}, definition);
  instance.data = plain(definition.data || {});
  instance.setData = function (updates) {
    Object.keys(updates || {}).forEach((key) => {
      instance.data[key] = updates[key];
      if (key.includes('.') || key.includes('[')) {
        setNestedValue(instance.data, key, updates[key]);
      }
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
