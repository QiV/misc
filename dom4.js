//https://github.com/WebReflection/dom4
/* jshint loopfunc: true, noempty: false*/
// http://www.w3.org/TR/dom/#element
'use strict';

var _global = require('global');

var property;
var TemporaryPrototype;
var TemporaryTokenList;
var wrapVerifyToken;
var ArrayPrototype = Array.prototype;
var indexOf = ArrayPrototype.indexOf;
var splice = ArrayPrototype.splice;
var join = ArrayPrototype.join;
var push = ArrayPrototype.push;
var defineProperty = Object.defineProperty;
var NodePrototype = _global.window.Node.prototype;
var ElementPrototype = _global.window.Element.prototype;
var SVGElement = _global.window.SVGElement;
var classListDescriptor = {
  get: function get() {
    return new DOMTokenList(this);
  },
  set: function set() {}
};
var trim = /^\s+|\s+$/g;
var spaces = /\s+/;
var SPACE = '\x20';
var CLASS_LIST = 'classList';

// most likely an IE9 only issue
// see https://github.com/WebReflection/dom4/issues/6
if (!_global.document.createElement('a').matches('a')) {
  NodePrototype[property] = (function (matches) {
    return function (selector) {
      return matches.call(this.parentNode ? this : createDocumentFragment().appendChild(this), selector);
    };
  })(NodePrototype[property]);
}

// used to fix both old webkit and SVG
DOMTokenList.prototype = {
  length: 0,
  add: function add() {
    for (var j = 0, token; j < arguments.length; j++) {
      token = arguments[j];
      if (!this.contains(token)) {
        push.call(this, property);
      }
    }
    if (this._isSVG) {
      this._.setAttribute('class', '' + this);
    } else {
      this._.className = '' + this;
    }
  },
  contains: function contains(token) {
    return indexOf.call(this, property = verifyToken(token)) > -1;
  },
  item: function item(i) {
    return this[i] || null;
  },
  remove: function remove() {
    for (var j = 0, token; j < arguments.length; j++) {
      token = arguments[j];
      if (this.contains(token)) {
        splice.call(this, j, 1);
      }
    }
    if (this._isSVG) {
      this._.setAttribute('class', '' + this);
    } else {
      this._.className = '' + this;
    }
  },
  toggle: toggle,
  toString: function toString() {
    return join.call(this, SPACE);
  }
};

if (SVGElement && !(CLASS_LIST in SVGElement.prototype)) {
  defineProperty(SVGElement.prototype, CLASS_LIST, classListDescriptor);
}

// http://www.w3.org/TR/dom/#domtokenlist
// iOS 5.1 has completely screwed this property
// classList in ElementPrototype is false
// but it's actually there as getter
if (!(CLASS_LIST in _global.document.documentElement)) {
  defineProperty(ElementPrototype, CLASS_LIST, classListDescriptor);
} else {
  // iOS 5.1 and Nokia ASHA do not support multiple add or remove
  // trying to detect and fix that in here
  TemporaryTokenList = _global.document.createElement('div')[CLASS_LIST];
  TemporaryTokenList.add('a', 'b', 'a');
  if (TemporaryTokenList !== 'a\x20b') {
    // no other way to reach original methods in iOS 5.1
    TemporaryPrototype = TemporaryTokenList.constructor.prototype;
    if (!('add' in TemporaryPrototype)) {
      // ASHA double fails in here
      TemporaryPrototype = _global.window.TemporaryTokenList.prototype;
    }
    wrapVerifyToken = function (original) {
      return function () {
        var i = 0;
        while (i < arguments.length) {
          original.call(this, arguments[i++]);
        }
      };
    };
    TemporaryPrototype.add = wrapVerifyToken(TemporaryPrototype.add);
    TemporaryPrototype.remove = wrapVerifyToken(TemporaryPrototype.remove);
    // toggle is broken too ^_^ ... let's fix it
    TemporaryPrototype.toggle = toggle;
  }
}

// requestAnimationFrame partial polyfill
(function () {
  for (var raf, rAF = _global.window.requestAnimationFrame, cAF = _global.window.cancelAnimationFrame, prefixes = ['o', 'ms', 'moz', 'webkit'], i = prefixes.length; !cAF && i--;) {
    rAF = rAF || _global.window[prefixes[i] + 'RequestAnimationFrame'];
    cAF = _global.window[prefixes[i] + 'CancelAnimationFrame'] || _global.window[prefixes[i] + 'CancelRequestAnimationFrame'];
  }
  if (!cAF) {
    // some FF apparently implemented rAF but no cAF
    if (rAF) {
      raf = rAF;
      rAF = function (callback) {
        var goOn = true;
        raf(function () {
          if (goOn) {
            callback.apply(this, arguments);
          }
        });
        return function () {
          goOn = false;
        };
      };
      cAF = function (id) {
        id();
      };
    } else {
      rAF = function (callback) {
        return setTimeout(callback, 15, 15);
      };
      cAF = function (id) {
        clearTimeout(id);
      };
    }
  }
  _global.window.requestAnimationFrame = rAF;
  _global.window.cancelAnimationFrame = cAF;
})();

// http://www.w3.org/TR/dom/#customevent
try {
  new _global.window.CustomEvent('?');
} catch (o_O) {
  _global.window.CustomEvent = (function (eventName, defaultInitDict) {

    // the infamous substitute
    function CustomEvent(type, eventInitDict) {
      /*jshint eqnull:true */
      var event = _global.document.createEvent(eventName);
      if (typeof type !== 'string') {
        throw new Error('An event name must be provided');
      }
      if (eventName === 'Event') {
        event.initCustomEvent = initCustomEvent;
      }
      if (eventInitDict == null) {
        eventInitDict = defaultInitDict;
      }
      event.initCustomEvent(type, eventInitDict.bubbles, eventInitDict.cancelable, eventInitDict.detail);
      return event;
    }

    // attached at runtime
    function initCustomEvent(type, bubbles, cancelable, detail) {
      /*jshint validthis:true*/
      this.initEvent(type, bubbles, cancelable);
      this.detail = detail;
    }

    // that's it
    return CustomEvent;
  })(
  // is this IE9 or IE10 ?
  // where CustomEvent is there
  // but not usable as construtor ?
  _global.window.CustomEvent ?
  // use the CustomEvent interface in such case
  'CustomEvent' : 'Event',
  // otherwise the common compatible one
  {
    bubbles: false,
    cancelable: false,
    detail: null
  });
}

// http://www.w3.org/TR/domcore/#domtokenlist
function verifyToken(token) {
  if (!token) {
    throw 'SyntaxError';
  } else if (spaces.test(token)) {
    throw 'InvalidCharacterError';
  }
  return token;
}

function DOMTokenList(node) {
  var className = node.className,
      isSVG = typeof className === 'object',
      value = (isSVG ? className.baseVal : className).replace(trim, '');
  if (value.length) {
    push.apply(this, value.split(spaces));
  }
  this._isSVG = isSVG;
  this._ = node;
}

function createDocumentFragment() {
  return _global.document.createDocumentFragment();
}

function toggle(token, force) {
  if (this.contains(token)) {
    if (!force) {
      // force is not true (either false or omitted)
      this.remove(token);
    }
  } else if (force === undefined || force) {
    force = true;
    this.add(token);
  }
  return !!force;
}