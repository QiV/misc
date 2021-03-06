
// Backbone.History
// ----------------

// Handles cross-browser history management, based on either
// [pushState](http://diveintohtml5.info/history.html) and real URLs, or
// [onhashchange](https://developer.mozilla.org/en-US/docs/DOM/window.onhashchange)
// and URL fragments. If the browser supports neither (old IE, natch),
// falls back to polling.

var W = window;
import {Eventable} from './events';

var routeStripper = /^[#\/]|\s+$/g;// Cached regex for stripping a leading hash/slash and trailing space.
var rootStripper = /^\/+|\/+$/g;// Cached regex for stripping leading and trailing slashes.
var pathStripper = /#.*$/;// Cached regex for stripping urls of hash.
var isHistoryStarted = false;// Has the history handling already been started?

function History() {
  // The default interval to poll for hash changes, if necessary, is
  // twenty times a second.
  this.interval = 50;

  this.handlers = [];
  // Ensure that `History` can be used outside of the browser.
  if (typeof W !== 'undefined') {
    this.location = W.location;
    this.history = W.history;
  }
}

Object.assign(Eventable(History.prototype), {
 // Are we at the app root?
  atRoot () {
    var path = this.location.pathname.replace(/[^\/]$/, '$&/');
    return path === this.root && !this.getSearch();
  },
  // In IE6, the hash fragment and search params are incorrect if the
  // fragment contains `?`.
  getSearch () {
    var match = this.location.href.replace(/#.*/, '').match(/\?.+/);
    return match ? match[0] : '';
  },

  // Gets the true hash value. Cannot use location.hash directly due to bug
  // in Firefox where location.hash will always be decoded.
  getHash (window) {
    var match = (window || this).location.href.match(/#(.*)$/);
    return match ? match[1] : '';
  },

  // Get the pathname and search params, without the root.
  getPath () {
    var path = decodeURI(this.location.pathname + this.getSearch());
    var root = this.root.slice(0, -1);
    if (!path.indexOf(root)) {
      path = path.slice(root.length);
    }
    return path.charAt(0) === '/' ? path.slice(1) : path;
  },

  // Get the cross-browser normalized URL fragment from the path or hash.
  getFragment (fragment) {
    if (fragment === null || fragment === undefined) {
      if (this._hasPushState || !this._wantsHashChange) {
        fragment = this.getPath();
      } else {
        fragment = this.getHash();
      }
    }
    return fragment.replace(routeStripper, '');
  },

  // Start the hash change handling, returning `true` if the current URL matches
  // an existing route, and `false` otherwise.
  start (options) {
    if (isHistoryStarted) {
      throw new Error('Backbone.history has already been started');
    }
    isHistoryStarted = true;

    // Figure out the initial configuration. Do we need an iframe?
    // Is pushState desired ... is it available?
    this.options          = Object.assign({root: '/'}, this.options, options);
    this.root             = this.options.root;
    this._wantsHashChange = this.options.hashChange !== false;
    this._hasHashChange   = 'onhashchange' in window;
    this._wantsPushState  = !!this.options.pushState;
    this._hasPushState    = !!(this.options.pushState && this.history && this.history.pushState);
    this.fragment         = this.getFragment();

    // Normalize root to always include a leading and trailing slash.
    this.root = ('/' + this.root + '/').replace(rootStripper, '/');

    // Transition from hashChange to pushState or vice versa if both are
    // requested.
    if (this._wantsHashChange && this._wantsPushState) {

      // If we've started off with a route from a `pushState`-enabled
      // browser, but we're currently in a browser that doesn't support it...
      if (!this._hasPushState && !this.atRoot()) {
        var root = this.root.slice(0, -1) || '/';
        this.location.replace(root + '#' + this.getPath());
        // Return immediately as browser will do redirect to new url
        return true;

      // Or if we've started out with a hash-based route, but we're currently
      // in a browser where it could be `pushState`-based instead...
      } else if (this._hasPushState && this.atRoot()) {
        this.navigate(this.getHash(), {replace: true});
      }

    }
    // Proxy an iframe to handle location events if the browser doesn't
    // support the `hashchange` event, HTML5 history, or the user wants
    // `hashChange` but not `pushState`.
    if (!this._hasHashChange && this._wantsHashChange && (!this._wantsPushState || !this._hasPushState)) {
      var iframe = document.createElement('iframe');
      iframe.src = 'javascript:0';
      iframe.style.display = 'none';
      iframe.tabIndex = -1;
      var body = document.body;
      // Using `appendChild` will throw on IE < 9 if the document is not ready.
      this.iframe = body.insertBefore(iframe, body.firstChild).contentWindow;
      this.iframe.document.open().close();
      this.iframe.location.hash = '#' + this.fragment;
    }

    // Depending on whether we're using pushState or hashes, and whether
    // 'onhashchange' is supported, determine how we check the URL state.
    if (this._hasPushState) {
      W.on('popstate', this.checkUrl.bind(this));
    } else if (this._wantsHashChange && this._hasHashChange && !this.iframe) {
      W.on('hashchange', this.checkUrl.bind(this));
    } else if (this._wantsHashChange) {
      this._checkUrlInterval = setInterval(this.checkUrl.bind(this), this.interval);
    }

    if (!this.options.silent) {
      return this.loadUrl();
    }
  },

  // Disable Backbone.history, perhaps temporarily. Not useful in a real app,
  // but possibly useful for unit testing Routers.
  stop () {
    W.off('popstate').off('hashchange');
    // Clean up the iframe if necessary.
    if (this.iframe) {
      document.body.removeChild(this.iframe.frameElement);
      this.iframe = null;
    }
    if (this._checkUrlInterval) {
      clearInterval(this._checkUrlInterval);
    }
    History.started = false;
  },

  // Add a route to be tested when the fragment changes. Routes added later
  // may override previous routes.
  route (route, callback) {
    this.handlers.unshift({route: route, callback: callback});
  },

  // Checks the current URL to see if it has changed, and if it has,
  // calls `loadUrl`, normalizing across the hidden iframe.
  checkUrl (/*e*/) {
    var current = this.getFragment();
    // If the user pressed the back button, the iframe's hash will have
    // changed and we should use that for comparison.
    if (current === this.fragment && this.iframe) {
      current = this.getHash(this.iframe);
    }
    if (current === this.fragment) {
      return false;
    }
    if (this.iframe) {
      this.navigate(current);
    }

    this.loadUrl();
  },

  // Attempt to load the current URL fragment. If a route succeeds with a
  // match, returns `true`. If no defined routes matches the fragment,
  // returns `false`.
  loadUrl (fragment) {
    fragment = this.fragment = this.getFragment(fragment);
    return this.handlers.some(function(handler) {
      if (handler.route.test(fragment)) {
        handler.callback(fragment);
        return true;
      }
    });
  },

  // Save a fragment into the hash history, or replace the URL state if the
  // 'replace' option is passed. You are responsible for properly URL-encoding
  // the fragment in advance.
  //
  // The options object can contain `trigger: true` if you wish to have the
  // route callback be fired (not usually desirable), or `replace: true`, if
  // you wish to modify the current URL without adding an entry to the history.
  navigate (fragment, options) {
    if (!isHistoryStarted) {
      return false;
    }
    if (!options || options === true) {
      options = {trigger: !!options};
    }

    // Normalize the fragment.
    fragment = this.getFragment(fragment || '');

    // Don't include a trailing slash on the root.
    var root = this.root;
    if (fragment === '' || fragment.charAt(0) === '?') {
      root = root.slice(0, -1) || '/';
    }
    var url = root + fragment;

    // Strip the hash and decode for matching.
    fragment = decodeURI(fragment.replace(pathStripper, ''));

    if (this.fragment === fragment) {
      return;
    }
    this.fragment = fragment;

    // If pushState is available, we use it to set the fragment as a real URL.
    if (this._hasPushState) {
      this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

    // If hash changes haven't been explicitly disabled, update the hash
    // fragment to store history.
    } else if (this._wantsHashChange) {
      this._updateHash(this.location, fragment, options.replace);
      if (this.iframe && (fragment !== this.getHash(this.iframe))) {
        // Opening and closing the iframe tricks IE7 and earlier to push a
        // history entry on hash-tag change.  When replace is true, we don't
        // want this.
        if(!options.replace) {
          this.iframe.document.open().close();
        }
        this._updateHash(this.iframe.location, fragment, options.replace);
      }

    // If you've told us that you explicitly don't want fallback hashchange-
    // based history, then `navigate` becomes a page refresh.
    } else {
      return this.location.assign(url);
    }
    if (options.trigger) {
      return this.loadUrl(fragment);
    }
  },

  // Update the hash location, either replacing the current entry, or adding
  // a new one to the browser history.
  _updateHash (location, fragment, replace) {
    if (replace) {
      var href = location.href.replace(/(javascript:|#).*$/, '');
      location.replace(href + '#' + fragment);
    } else {
      // Some browsers require that `hash` contains a leading #.
      location.hash = '#' + fragment;
    }
  }
});

export default new History();

