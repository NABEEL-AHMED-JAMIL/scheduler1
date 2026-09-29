import { Bi as signal, I as EventEmitter, T as DOCUMENT, U as InjectionToken, W as Injector, dt as SecurityContext, et as NgZone, sa as ɵɵdefineInjector, x as CSP_NONCE, xr as inject } from "./_resource-chunk-DQIR0rrZ.js";
import { Ba as ɵɵdefineComponent, Ds as ɵɵtemplate, Fo as ɵɵloadQuery, Gt as ChangeDetectionStrategy, Ha as ɵɵdefineNgModule, Ji as ɵɵNgOnChangesFeature, Jt as Component, Ks as ɵɵviewQuery, Nn as NgModule, O as booleanAttribute, S as ViewChild, Sn as Input, Va as ɵɵdefineDirective, Wa as ɵɵdefineService, Wn as Renderer2, Zn as Service, fn as ElementRef, ia as ɵɵattribute, ir as TemplateRef, ki as setClassMetadata, pr as ViewEncapsulation, qi as ɵɵInheritDefinitionFeature, r as ChangeDetectorRef, rs as ɵɵqueryRefresh, un as Directive, vr as afterNextRender, zn as Output } from "./core-LVEorzPH.js";
import { Ct as take, Qn as Subject, T as skip, Tt as debounceTime, Xt as filter, dn as concat, g as takeUntil, hn as combineLatest, rr as Observable, un as defer, vn as map, x as startWith } from "./esm5-vka3zwLZ.js";
import { A as TemplatePortal, D as CdkPortalOutlet, E as CdkPortal, O as ComponentPortal, S as Platform, T as BasePortalOutlet, _ as CdkMonitorFocus, b as coerceElement, f as hasModifierKey, g as _CdkPrivateStyleLoader, h as coerceArray, i as OverlayRef, k as PortalModule, l as createGlobalPositionStrategy, m as Directionality, n as OverlayContainer, p as _IdGenerator, r as OverlayModule, s as createBlockScrollStrategy, t as OverlayConfig, u as createOverlayRef, v as FocusMonitor, w as _getFocusedElementPierceShadowDom, x as coerceNumberProperty } from "./_overlay-module-chunk-DG6NNI5l.js";
import { r as DomSanitizer } from "./platform-browser-DD4n-Qlp.js";
//#region ../../scheduler1/next/node_modules/@angular/cdk/fesm2022/private.mjs
var _VisuallyHiddenLoader = class _VisuallyHiddenLoader {
	static ɵfac = function _VisuallyHiddenLoader_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || _VisuallyHiddenLoader)();
	};
	static ɵcmp = /* @__PURE__ */ ɵɵdefineComponent({
		type: _VisuallyHiddenLoader,
		selectors: [["ng-component"]],
		exportAs: ["cdkVisuallyHidden"],
		decls: 0,
		vars: 0,
		template: function _VisuallyHiddenLoader_Template(rf, ctx) {},
		styles: [".cdk-visually-hidden {\n  border: 0;\n  clip: rect(0 0 0 0);\n  height: 1px;\n  margin: -1px;\n  overflow: hidden;\n  padding: 0;\n  position: absolute;\n  width: 1px;\n  white-space: nowrap;\n  outline: 0;\n  -webkit-appearance: none;\n  -moz-appearance: none;\n  left: 0;\n}\n[dir=rtl] .cdk-visually-hidden {\n  left: auto;\n  right: 0;\n}\n"],
		encapsulation: 2
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(_VisuallyHiddenLoader, [{
		type: Component,
		args: [{
			exportAs: "cdkVisuallyHidden",
			encapsulation: ViewEncapsulation.None,
			template: "",
			styles: [".cdk-visually-hidden {\n  border: 0;\n  clip: rect(0 0 0 0);\n  height: 1px;\n  margin: -1px;\n  overflow: hidden;\n  padding: 0;\n  position: absolute;\n  width: 1px;\n  white-space: nowrap;\n  outline: 0;\n  -webkit-appearance: none;\n  -moz-appearance: none;\n  left: 0;\n}\n[dir=rtl] .cdk-visually-hidden {\n  left: auto;\n  right: 0;\n}\n"]
		}]
	}], null, null);
})();
var policy;
function getPolicy() {
	if (policy === void 0) {
		policy = null;
		if (typeof window !== "undefined") {
			const ttWindow = window;
			if (ttWindow.trustedTypes !== void 0) try {
				policy = ttWindow.trustedTypes.createPolicy("angular#components", { createHTML: (s) => s });
			} catch (error) {
				console.error(error);
			}
		}
	}
	return policy;
}
function trustedHTMLFromString(html) {
	return getPolicy()?.createHTML(html) || html;
}
function _setInnerHtml(element, html, sanitizer) {
	const cleanHtml = sanitizer.sanitize(SecurityContext.HTML, html);
	if (cleanHtml === null && (typeof ngDevMode === "undefined" || ngDevMode)) throw new Error(`Could not sanitize HTML: ${html}`);
	element.innerHTML = trustedHTMLFromString(cleanHtml || "");
}
//#endregion
//#region ../../scheduler1/next/node_modules/@angular/cdk/fesm2022/_breakpoints-observer-chunk.mjs
var mediaQueriesForWebkitCompatibility = /* @__PURE__ */ new Set();
var mediaQueryStyleNode;
var MediaMatcher = class MediaMatcher {
	_platform = inject(Platform);
	_nonce = inject(CSP_NONCE, { optional: true });
	_matchMedia;
	constructor() {
		this._matchMedia = this._platform.isBrowser && window.matchMedia ? window.matchMedia.bind(window) : noopMatchMedia;
	}
	matchMedia(query) {
		if (this._platform.WEBKIT || this._platform.BLINK) createEmptyStyleRule(query, this._nonce);
		return this._matchMedia(query);
	}
	static ɵfac = function MediaMatcher_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || MediaMatcher)();
	};
	static ɵprov = /* @__PURE__ */ ɵɵdefineService({
		token: MediaMatcher,
		factory: MediaMatcher.ɵfac
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(MediaMatcher, [{ type: Service }], () => [], null);
})();
function createEmptyStyleRule(query, nonce) {
	if (mediaQueriesForWebkitCompatibility.has(query)) return;
	try {
		if (!mediaQueryStyleNode) {
			mediaQueryStyleNode = document.createElement("style");
			if (nonce) mediaQueryStyleNode.setAttribute("nonce", nonce);
			mediaQueryStyleNode.setAttribute("type", "text/css");
			document.head.appendChild(mediaQueryStyleNode);
		}
		if (mediaQueryStyleNode.sheet) {
			mediaQueryStyleNode.sheet.insertRule(`@media ${query.replace(/[{}]/g, "")} {body{ }}`, 0);
			mediaQueriesForWebkitCompatibility.add(query);
		}
	} catch (e) {
		console.error(e);
	}
}
function noopMatchMedia(query) {
	return {
		matches: query === "all" || query === "",
		media: query,
		addListener: () => {},
		removeListener: () => {}
	};
}
var BreakpointObserver = class BreakpointObserver {
	_mediaMatcher = inject(MediaMatcher);
	_zone = inject(NgZone);
	_queries = /* @__PURE__ */ new Map();
	_destroySubject = new Subject();
	ngOnDestroy() {
		this._destroySubject.next();
		this._destroySubject.complete();
	}
	isMatched(value) {
		return splitQueries(coerceArray(value)).some((mediaQuery) => this._registerQuery(mediaQuery).mql.matches);
	}
	observe(value) {
		let stateObservable = combineLatest(splitQueries(coerceArray(value)).map((query) => this._registerQuery(query).observable));
		stateObservable = concat(stateObservable.pipe(take(1)), stateObservable.pipe(skip(1), debounceTime(0)));
		return stateObservable.pipe(map((breakpointStates) => {
			const response = {
				matches: false,
				breakpoints: {}
			};
			breakpointStates.forEach(({ matches, query }) => {
				response.matches = response.matches || matches;
				response.breakpoints[query] = matches;
			});
			return response;
		}));
	}
	_registerQuery(query) {
		if (this._queries.has(query)) return this._queries.get(query);
		const mql = this._mediaMatcher.matchMedia(query);
		const output = {
			observable: new Observable((observer) => {
				const handler = (e) => this._zone.run(() => observer.next(e));
				mql.addListener(handler);
				return () => {
					mql.removeListener(handler);
				};
			}).pipe(startWith(mql), map(({ matches }) => ({
				query,
				matches
			})), takeUntil(this._destroySubject)),
			mql
		};
		this._queries.set(query, output);
		return output;
	}
	static ɵfac = function BreakpointObserver_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || BreakpointObserver)();
	};
	static ɵprov = /* @__PURE__ */ ɵɵdefineService({
		token: BreakpointObserver,
		factory: BreakpointObserver.ɵfac
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(BreakpointObserver, [{ type: Service }], null, null);
})();
function splitQueries(queries) {
	return queries.map((query) => query.split(",")).reduce((a1, a2) => a1.concat(a2)).map((query) => query.trim());
}
//#endregion
//#region ../../scheduler1/next/node_modules/@angular/cdk/fesm2022/observers.mjs
function shouldIgnoreRecord(record) {
	if (record.type === "characterData" && record.target instanceof Comment) return true;
	if (record.type === "childList") {
		for (let i = 0; i < record.addedNodes.length; i++) if (!(record.addedNodes[i] instanceof Comment)) return false;
		for (let i = 0; i < record.removedNodes.length; i++) if (!(record.removedNodes[i] instanceof Comment)) return false;
		return true;
	}
	return false;
}
var MutationObserverFactory = class MutationObserverFactory {
	create(callback) {
		return typeof MutationObserver === "undefined" ? null : new MutationObserver(callback);
	}
	static ɵfac = function MutationObserverFactory_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || MutationObserverFactory)();
	};
	static ɵprov = /* @__PURE__ */ ɵɵdefineService({
		token: MutationObserverFactory,
		factory: MutationObserverFactory.ɵfac
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(MutationObserverFactory, [{ type: Service }], null, null);
})();
var ContentObserver = class ContentObserver {
	_mutationObserverFactory = inject(MutationObserverFactory);
	_observedElements = /* @__PURE__ */ new Map();
	_ngZone = inject(NgZone);
	ngOnDestroy() {
		this._observedElements.forEach((_, element) => this._cleanupObserver(element));
	}
	observe(elementOrRef) {
		const element = coerceElement(elementOrRef);
		return new Observable((observer) => {
			const subscription = this._observeElement(element).pipe(map((records) => records.filter((record) => !shouldIgnoreRecord(record))), filter((records) => !!records.length)).subscribe((records) => {
				this._ngZone.run(() => {
					observer.next(records);
				});
			});
			return () => {
				subscription.unsubscribe();
				this._unobserveElement(element);
			};
		});
	}
	_observeElement(element) {
		return this._ngZone.runOutsideAngular(() => {
			if (!this._observedElements.has(element)) {
				const stream = new Subject();
				const observer = this._mutationObserverFactory.create((mutations) => stream.next(mutations));
				if (observer) observer.observe(element, {
					characterData: true,
					childList: true,
					subtree: true
				});
				this._observedElements.set(element, {
					observer,
					stream,
					count: 1
				});
			} else this._observedElements.get(element).count++;
			return this._observedElements.get(element).stream;
		});
	}
	_unobserveElement(element) {
		if (this._observedElements.has(element)) {
			this._observedElements.get(element).count--;
			if (!this._observedElements.get(element).count) this._cleanupObserver(element);
		}
	}
	_cleanupObserver(element) {
		if (this._observedElements.has(element)) {
			const { observer, stream } = this._observedElements.get(element);
			if (observer) observer.disconnect();
			stream.complete();
			this._observedElements.delete(element);
		}
	}
	static ɵfac = function ContentObserver_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || ContentObserver)();
	};
	static ɵprov = /* @__PURE__ */ ɵɵdefineService({
		token: ContentObserver,
		factory: ContentObserver.ɵfac
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(ContentObserver, [{ type: Service }], null, null);
})();
var CdkObserveContent = class CdkObserveContent {
	_contentObserver = inject(ContentObserver);
	_elementRef = inject(ElementRef);
	event = new EventEmitter();
	get disabled() {
		return this._disabled;
	}
	set disabled(value) {
		this._disabled = value;
		this._disabled ? this._unsubscribe() : this._subscribe();
	}
	_disabled = false;
	get debounce() {
		return this._debounce;
	}
	set debounce(value) {
		this._debounce = coerceNumberProperty(value);
		this._subscribe();
	}
	_debounce;
	_currentSubscription = null;
	ngAfterContentInit() {
		if (!this._currentSubscription && !this.disabled) this._subscribe();
	}
	ngOnDestroy() {
		this._unsubscribe();
	}
	_subscribe() {
		this._unsubscribe();
		const stream = this._contentObserver.observe(this._elementRef);
		this._currentSubscription = (this.debounce ? stream.pipe(debounceTime(this.debounce)) : stream).subscribe(this.event);
	}
	_unsubscribe() {
		this._currentSubscription?.unsubscribe();
	}
	static ɵfac = function CdkObserveContent_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || CdkObserveContent)();
	};
	static ɵdir = /* @__PURE__ */ ɵɵdefineDirective({
		type: CdkObserveContent,
		selectors: [[
			"",
			"cdkObserveContent",
			""
		]],
		inputs: {
			disabled: [
				2,
				"cdkObserveContentDisabled",
				"disabled",
				booleanAttribute
			],
			debounce: "debounce"
		},
		outputs: { event: "cdkObserveContent" },
		exportAs: ["cdkObserveContent"]
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(CdkObserveContent, [{
		type: Directive,
		args: [{
			selector: "[cdkObserveContent]",
			exportAs: "cdkObserveContent"
		}]
	}], null, {
		event: [{
			type: Output,
			args: ["cdkObserveContent"]
		}],
		disabled: [{
			type: Input,
			args: [{
				alias: "cdkObserveContentDisabled",
				transform: booleanAttribute
			}]
		}],
		debounce: [{ type: Input }]
	});
})();
var ObserversModule = class ObserversModule {
	static ɵfac = function ObserversModule_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || ObserversModule)();
	};
	static ɵmod = /* @__PURE__ */ ɵɵdefineNgModule({
		type: ObserversModule,
		imports: [CdkObserveContent],
		exports: [CdkObserveContent]
	});
	static ɵinj = /* @__PURE__ */ ɵɵdefineInjector({ providers: [MutationObserverFactory] });
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(ObserversModule, [{
		type: NgModule,
		args: [{
			imports: [CdkObserveContent],
			exports: [CdkObserveContent],
			providers: [MutationObserverFactory]
		}]
	}], null, null);
})();
//#endregion
//#region ../../scheduler1/next/node_modules/@angular/cdk/fesm2022/_a11y-module-chunk.mjs
var InteractivityChecker = class InteractivityChecker {
	_platform = inject(Platform);
	isDisabled(element) {
		return element.hasAttribute("disabled");
	}
	isVisible(element) {
		return hasGeometry(element) && getComputedStyle(element).visibility === "visible";
	}
	isTabbable(element) {
		if (!this._platform.isBrowser) return false;
		const frameElement = getFrameElement(getWindow(element));
		if (frameElement) {
			if (getTabIndexValue(frameElement) === -1) return false;
			if (!this.isVisible(frameElement)) return false;
		}
		let nodeName = element.nodeName.toLowerCase();
		let tabIndexValue = getTabIndexValue(element);
		if (element.hasAttribute("contenteditable")) return tabIndexValue !== -1;
		if (nodeName === "iframe" || nodeName === "object") return false;
		if (this._platform.WEBKIT && this._platform.IOS && !isPotentiallyTabbableIOS(element)) return false;
		if (nodeName === "audio") {
			if (!element.hasAttribute("controls")) return false;
			return tabIndexValue !== -1;
		}
		if (nodeName === "video") {
			if (tabIndexValue === -1) return false;
			if (tabIndexValue !== null) return true;
			return this._platform.FIREFOX || element.hasAttribute("controls");
		}
		return element.tabIndex >= 0;
	}
	isFocusable(element, config) {
		return isPotentiallyFocusable(element) && !this.isDisabled(element) && (config?.ignoreVisibility || this.isVisible(element));
	}
	static ɵfac = function InteractivityChecker_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || InteractivityChecker)();
	};
	static ɵprov = /* @__PURE__ */ ɵɵdefineService({
		token: InteractivityChecker,
		factory: InteractivityChecker.ɵfac
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(InteractivityChecker, [{ type: Service }], null, null);
})();
function getFrameElement(window) {
	try {
		return window.frameElement;
	} catch {
		return null;
	}
}
function hasGeometry(element) {
	return !!(element.offsetWidth || element.offsetHeight || typeof element.getClientRects === "function" && element.getClientRects().length);
}
function isNativeFormElement(element) {
	let nodeName = element.nodeName.toLowerCase();
	return nodeName === "input" || nodeName === "select" || nodeName === "button" || nodeName === "textarea";
}
function isHiddenInput(element) {
	return isInputElement(element) && element.type == "hidden";
}
function isAnchorWithHref(element) {
	return isAnchorElement(element) && element.hasAttribute("href");
}
function isInputElement(element) {
	return element.nodeName.toLowerCase() == "input";
}
function isAnchorElement(element) {
	return element.nodeName.toLowerCase() == "a";
}
function hasValidTabIndex(element) {
	if (!element.hasAttribute("tabindex") || element.tabIndex === void 0) return false;
	let tabIndex = element.getAttribute("tabindex");
	return !!(tabIndex && !isNaN(parseInt(tabIndex, 10)));
}
function getTabIndexValue(element) {
	if (!hasValidTabIndex(element)) return null;
	const tabIndex = parseInt(element.getAttribute("tabindex") || "", 10);
	return isNaN(tabIndex) ? -1 : tabIndex;
}
function isPotentiallyTabbableIOS(element) {
	let nodeName = element.nodeName.toLowerCase();
	let inputType = nodeName === "input" && element.type;
	return inputType === "text" || inputType === "password" || nodeName === "select" || nodeName === "textarea";
}
function isPotentiallyFocusable(element) {
	if (isHiddenInput(element)) return false;
	return isNativeFormElement(element) || isAnchorWithHref(element) || element.hasAttribute("contenteditable") || hasValidTabIndex(element);
}
function getWindow(node) {
	return node.ownerDocument && node.ownerDocument.defaultView || window;
}
var FocusTrap = class {
	_element;
	_checker;
	_ngZone;
	_document;
	_injector;
	_startAnchor = null;
	_endAnchor = null;
	_hasAttached = false;
	startAnchorListener = () => {
		if (!this.focusLastTabbableElement() && this._checker.isFocusable(this._element)) this._element.focus();
	};
	endAnchorListener = () => {
		if (!this.focusFirstTabbableElement() && this._checker.isFocusable(this._element)) this._element.focus();
	};
	get enabled() {
		return this._enabled;
	}
	set enabled(value) {
		this._enabled = value;
		if (this._startAnchor && this._endAnchor) {
			this._toggleAnchorTabIndex(value, this._startAnchor);
			this._toggleAnchorTabIndex(value, this._endAnchor);
		}
	}
	_enabled = true;
	constructor(_element, _checker, _ngZone, _document, deferAnchors = false, _injector) {
		this._element = _element;
		this._checker = _checker;
		this._ngZone = _ngZone;
		this._document = _document;
		this._injector = _injector;
		if (!deferAnchors) this.attachAnchors();
	}
	destroy() {
		const startAnchor = this._startAnchor;
		const endAnchor = this._endAnchor;
		if (startAnchor) {
			startAnchor.removeEventListener("focus", this.startAnchorListener);
			startAnchor.remove();
		}
		if (endAnchor) {
			endAnchor.removeEventListener("focus", this.endAnchorListener);
			endAnchor.remove();
		}
		this._startAnchor = this._endAnchor = null;
		this._hasAttached = false;
	}
	attachAnchors() {
		if (this._hasAttached) return true;
		this._ngZone.runOutsideAngular(() => {
			if (!this._startAnchor) {
				this._startAnchor = this._createAnchor();
				this._startAnchor.addEventListener("focus", this.startAnchorListener);
			}
			if (!this._endAnchor) {
				this._endAnchor = this._createAnchor();
				this._endAnchor.addEventListener("focus", this.endAnchorListener);
			}
		});
		if (this._element.parentNode) {
			this._element.parentNode.insertBefore(this._startAnchor, this._element);
			this._element.parentNode.insertBefore(this._endAnchor, this._element.nextSibling);
			this._hasAttached = true;
		}
		return this._hasAttached;
	}
	focusInitialElementWhenReady(options) {
		return new Promise((resolve) => {
			this._executeOnStable(() => resolve(this.focusInitialElement(options)));
		});
	}
	focusFirstTabbableElementWhenReady(options) {
		return new Promise((resolve) => {
			this._executeOnStable(() => resolve(this.focusFirstTabbableElement(options)));
		});
	}
	focusLastTabbableElementWhenReady(options) {
		return new Promise((resolve) => {
			this._executeOnStable(() => resolve(this.focusLastTabbableElement(options)));
		});
	}
	_getRegionBoundary(bound) {
		const markers = this._element.querySelectorAll(`[cdk-focus-region-${bound}], [cdkFocusRegion${bound}], [cdk-focus-${bound}]`);
		if (typeof ngDevMode === "undefined" || ngDevMode) {
			for (let i = 0; i < markers.length; i++) if (markers[i].hasAttribute(`cdk-focus-${bound}`)) console.warn(`Found use of deprecated attribute 'cdk-focus-${bound}', use 'cdkFocusRegion${bound}' instead. The deprecated attribute will be removed in 8.0.0.`, markers[i]);
			else if (markers[i].hasAttribute(`cdk-focus-region-${bound}`)) console.warn(`Found use of deprecated attribute 'cdk-focus-region-${bound}', use 'cdkFocusRegion${bound}' instead. The deprecated attribute will be removed in 8.0.0.`, markers[i]);
		}
		if (bound == "start") return markers.length ? markers[0] : this._getFirstTabbableElement(this._element);
		return markers.length ? markers[markers.length - 1] : this._getLastTabbableElement(this._element);
	}
	focusInitialElement(options) {
		const redirectToElement = this._element.querySelector("[cdk-focus-initial], [cdkFocusInitial]");
		if (redirectToElement) {
			if ((typeof ngDevMode === "undefined" || ngDevMode) && redirectToElement.hasAttribute(`cdk-focus-initial`)) console.warn("Found use of deprecated attribute 'cdk-focus-initial', use 'cdkFocusInitial' instead. The deprecated attribute will be removed in 8.0.0", redirectToElement);
			if ((typeof ngDevMode === "undefined" || ngDevMode) && !this._checker.isFocusable(redirectToElement)) console.warn(`Element matching '[cdkFocusInitial]' is not focusable.`, redirectToElement);
			if (!this._checker.isFocusable(redirectToElement)) {
				const focusableChild = this._getFirstTabbableElement(redirectToElement);
				focusableChild?.focus(options);
				return !!focusableChild;
			}
			redirectToElement.focus(options);
			return true;
		}
		return this.focusFirstTabbableElement(options);
	}
	focusFirstTabbableElement(options) {
		const redirectToElement = this._getRegionBoundary("start");
		if (redirectToElement) redirectToElement.focus(options);
		return !!redirectToElement;
	}
	focusLastTabbableElement(options) {
		const redirectToElement = this._getRegionBoundary("end");
		if (redirectToElement) redirectToElement.focus(options);
		return !!redirectToElement;
	}
	hasAttached() {
		return this._hasAttached;
	}
	_getFirstTabbableElement(root) {
		if (this._checker.isFocusable(root) && this._checker.isTabbable(root)) return root;
		const children = root.children;
		for (let i = 0; i < children.length; i++) {
			const tabbableChild = children[i].nodeType === this._document.ELEMENT_NODE ? this._getFirstTabbableElement(children[i]) : null;
			if (tabbableChild) return tabbableChild;
		}
		return null;
	}
	_getLastTabbableElement(root) {
		if (this._checker.isFocusable(root) && this._checker.isTabbable(root)) return root;
		const children = root.children;
		for (let i = children.length - 1; i >= 0; i--) {
			const tabbableChild = children[i].nodeType === this._document.ELEMENT_NODE ? this._getLastTabbableElement(children[i]) : null;
			if (tabbableChild) return tabbableChild;
		}
		return null;
	}
	_createAnchor() {
		const anchor = this._document.createElement("div");
		this._toggleAnchorTabIndex(this._enabled, anchor);
		anchor.classList.add("cdk-visually-hidden");
		anchor.classList.add("cdk-focus-trap-anchor");
		anchor.setAttribute("aria-hidden", "true");
		return anchor;
	}
	_toggleAnchorTabIndex(isEnabled, anchor) {
		isEnabled ? anchor.setAttribute("tabindex", "0") : anchor.removeAttribute("tabindex");
	}
	toggleAnchors(enabled) {
		if (this._startAnchor && this._endAnchor) {
			this._toggleAnchorTabIndex(enabled, this._startAnchor);
			this._toggleAnchorTabIndex(enabled, this._endAnchor);
		}
	}
	_executeOnStable(fn) {
		afterNextRender(fn, { injector: this._injector });
	}
};
var FocusTrapFactory = class FocusTrapFactory {
	_checker = inject(InteractivityChecker);
	_ngZone = inject(NgZone);
	_document = inject(DOCUMENT);
	_injector = inject(Injector);
	constructor() {
		inject(_CdkPrivateStyleLoader).load(_VisuallyHiddenLoader);
	}
	create(element, deferCaptureElements = false) {
		return new FocusTrap(element, this._checker, this._ngZone, this._document, deferCaptureElements, this._injector);
	}
	static ɵfac = function FocusTrapFactory_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || FocusTrapFactory)();
	};
	static ɵprov = /* @__PURE__ */ ɵɵdefineService({
		token: FocusTrapFactory,
		factory: FocusTrapFactory.ɵfac
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(FocusTrapFactory, [{ type: Service }], () => [], null);
})();
var CdkTrapFocus = class CdkTrapFocus {
	_elementRef = inject(ElementRef);
	_focusTrapFactory = inject(FocusTrapFactory);
	focusTrap = void 0;
	_previouslyFocusedElement = null;
	get enabled() {
		return this.focusTrap?.enabled || false;
	}
	set enabled(value) {
		if (this.focusTrap) this.focusTrap.enabled = value;
	}
	autoCapture = false;
	constructor() {
		if (inject(Platform).isBrowser) this.focusTrap = this._focusTrapFactory.create(this._elementRef.nativeElement, true);
	}
	ngOnDestroy() {
		this.focusTrap?.destroy();
		if (this._previouslyFocusedElement) {
			this._previouslyFocusedElement.focus();
			this._previouslyFocusedElement = null;
		}
	}
	ngAfterContentInit() {
		this.focusTrap?.attachAnchors();
		if (this.autoCapture) this._captureFocus();
	}
	ngDoCheck() {
		if (this.focusTrap && !this.focusTrap.hasAttached()) this.focusTrap.attachAnchors();
	}
	ngOnChanges(changes) {
		const autoCaptureChange = changes["autoCapture"];
		if (autoCaptureChange && !autoCaptureChange.firstChange && this.autoCapture && this.focusTrap?.hasAttached()) this._captureFocus();
	}
	_captureFocus() {
		this._previouslyFocusedElement = _getFocusedElementPierceShadowDom();
		this.focusTrap?.focusInitialElementWhenReady();
	}
	static ɵfac = function CdkTrapFocus_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || CdkTrapFocus)();
	};
	static ɵdir = /* @__PURE__ */ ɵɵdefineDirective({
		type: CdkTrapFocus,
		selectors: [[
			"",
			"cdkTrapFocus",
			""
		]],
		inputs: {
			enabled: [
				2,
				"cdkTrapFocus",
				"enabled",
				booleanAttribute
			],
			autoCapture: [
				2,
				"cdkTrapFocusAutoCapture",
				"autoCapture",
				booleanAttribute
			]
		},
		exportAs: ["cdkTrapFocus"],
		features: [ɵɵNgOnChangesFeature]
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(CdkTrapFocus, [{
		type: Directive,
		args: [{
			selector: "[cdkTrapFocus]",
			exportAs: "cdkTrapFocus"
		}]
	}], () => [], {
		enabled: [{
			type: Input,
			args: [{
				alias: "cdkTrapFocus",
				transform: booleanAttribute
			}]
		}],
		autoCapture: [{
			type: Input,
			args: [{
				alias: "cdkTrapFocusAutoCapture",
				transform: booleanAttribute
			}]
		}]
	});
})();
var LIVE_ANNOUNCER_ELEMENT_TOKEN = new InjectionToken("liveAnnouncerElement", {
	providedIn: "root",
	factory: () => null
});
var LIVE_ANNOUNCER_DEFAULT_OPTIONS = new InjectionToken("LIVE_ANNOUNCER_DEFAULT_OPTIONS");
var uniqueIds = 0;
var LiveAnnouncer = class LiveAnnouncer {
	_ngZone = inject(NgZone);
	_defaultOptions = inject(LIVE_ANNOUNCER_DEFAULT_OPTIONS, { optional: true });
	_liveElement;
	_document = inject(DOCUMENT);
	_sanitizer = inject(DomSanitizer);
	_previousTimeout;
	_currentPromise;
	_currentResolve;
	constructor() {
		const elementToken = inject(LIVE_ANNOUNCER_ELEMENT_TOKEN, { optional: true });
		this._liveElement = elementToken || this._createLiveElement();
	}
	announce(message, ...args) {
		const defaultOptions = this._defaultOptions;
		let politeness;
		let duration;
		if (args.length === 1 && typeof args[0] === "number") duration = args[0];
		else [politeness, duration] = args;
		this.clear();
		clearTimeout(this._previousTimeout);
		if (!politeness) politeness = defaultOptions && defaultOptions.politeness ? defaultOptions.politeness : "polite";
		if (duration == null && defaultOptions) duration = defaultOptions.duration;
		this._liveElement.setAttribute("aria-live", politeness);
		if (this._liveElement.id) this._exposeAnnouncerToModals(this._liveElement.id);
		return this._ngZone.runOutsideAngular(() => {
			if (!this._currentPromise) this._currentPromise = new Promise((resolve) => this._currentResolve = resolve);
			clearTimeout(this._previousTimeout);
			this._previousTimeout = setTimeout(() => {
				if (!message || typeof message === "string") this._liveElement.textContent = message;
				else _setInnerHtml(this._liveElement, message, this._sanitizer);
				if (typeof duration === "number") this._previousTimeout = setTimeout(() => this.clear(), duration);
				this._currentResolve?.();
				this._currentPromise = this._currentResolve = void 0;
			}, 100);
			return this._currentPromise;
		});
	}
	clear() {
		if (this._liveElement) this._liveElement.textContent = "";
	}
	ngOnDestroy() {
		clearTimeout(this._previousTimeout);
		this._liveElement?.remove();
		this._liveElement = null;
		this._currentResolve?.();
		this._currentPromise = this._currentResolve = void 0;
	}
	_createLiveElement() {
		const elementClass = "cdk-live-announcer-element";
		const previousElements = this._document.getElementsByClassName(elementClass);
		const liveEl = this._document.createElement("div");
		for (let i = 0; i < previousElements.length; i++) previousElements[i].remove();
		liveEl.classList.add(elementClass);
		liveEl.classList.add("cdk-visually-hidden");
		liveEl.setAttribute("aria-atomic", "true");
		liveEl.setAttribute("aria-live", "polite");
		liveEl.id = `cdk-live-announcer-${uniqueIds++}`;
		this._document.body.appendChild(liveEl);
		return liveEl;
	}
	_exposeAnnouncerToModals(id) {
		const modals = this._document.querySelectorAll("body > .cdk-overlay-container [aria-modal=\"true\"]");
		for (let i = 0; i < modals.length; i++) {
			const modal = modals[i];
			const ariaOwns = modal.getAttribute("aria-owns");
			if (!ariaOwns) modal.setAttribute("aria-owns", id);
			else if (ariaOwns.indexOf(id) === -1) modal.setAttribute("aria-owns", ariaOwns + " " + id);
		}
	}
	static ɵfac = function LiveAnnouncer_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || LiveAnnouncer)();
	};
	static ɵprov = /* @__PURE__ */ ɵɵdefineService({
		token: LiveAnnouncer,
		factory: LiveAnnouncer.ɵfac
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(LiveAnnouncer, [{ type: Service }], () => [], null);
})();
var CdkAriaLive = class CdkAriaLive {
	_elementRef = inject(ElementRef);
	_liveAnnouncer = inject(LiveAnnouncer);
	_contentObserver = inject(ContentObserver);
	_ngZone = inject(NgZone);
	get politeness() {
		return this._politeness;
	}
	set politeness(value) {
		this._politeness = value === "off" || value === "assertive" ? value : "polite";
		if (this._politeness === "off") {
			if (this._subscription) {
				this._subscription.unsubscribe();
				this._subscription = void 0;
			}
		} else if (!this._subscription) this._subscription = this._ngZone.runOutsideAngular(() => {
			return this._contentObserver.observe(this._elementRef).subscribe(() => {
				const elementText = this._elementRef.nativeElement.textContent;
				if (elementText !== this._previousAnnouncedText) {
					this._liveAnnouncer.announce(elementText, this._politeness, this.duration);
					this._previousAnnouncedText = elementText;
				}
			});
		});
	}
	_politeness = "polite";
	duration;
	_previousAnnouncedText;
	_subscription;
	constructor() {
		inject(_CdkPrivateStyleLoader).load(_VisuallyHiddenLoader);
	}
	ngOnDestroy() {
		this._subscription?.unsubscribe();
	}
	static ɵfac = function CdkAriaLive_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || CdkAriaLive)();
	};
	static ɵdir = /* @__PURE__ */ ɵɵdefineDirective({
		type: CdkAriaLive,
		selectors: [[
			"",
			"cdkAriaLive",
			""
		]],
		inputs: {
			politeness: [
				0,
				"cdkAriaLive",
				"politeness"
			],
			duration: [
				0,
				"cdkAriaLiveDuration",
				"duration"
			]
		},
		exportAs: ["cdkAriaLive"]
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(CdkAriaLive, [{
		type: Directive,
		args: [{
			selector: "[cdkAriaLive]",
			exportAs: "cdkAriaLive"
		}]
	}], () => [], {
		politeness: [{
			type: Input,
			args: ["cdkAriaLive"]
		}],
		duration: [{
			type: Input,
			args: ["cdkAriaLiveDuration"]
		}]
	});
})();
var HighContrastMode;
(function(HighContrastMode) {
	HighContrastMode[HighContrastMode["NONE"] = 0] = "NONE";
	HighContrastMode[HighContrastMode["BLACK_ON_WHITE"] = 1] = "BLACK_ON_WHITE";
	HighContrastMode[HighContrastMode["WHITE_ON_BLACK"] = 2] = "WHITE_ON_BLACK";
})(HighContrastMode || (HighContrastMode = {}));
var BLACK_ON_WHITE_CSS_CLASS = "cdk-high-contrast-black-on-white";
var WHITE_ON_BLACK_CSS_CLASS = "cdk-high-contrast-white-on-black";
var HIGH_CONTRAST_MODE_ACTIVE_CSS_CLASS = "cdk-high-contrast-active";
var HighContrastModeDetector = class HighContrastModeDetector {
	_platform = inject(Platform);
	_hasCheckedHighContrastMode = false;
	_document = inject(DOCUMENT);
	_breakpointSubscription;
	constructor() {
		this._breakpointSubscription = inject(BreakpointObserver).observe("(forced-colors: active)").subscribe(() => {
			if (this._hasCheckedHighContrastMode) {
				this._hasCheckedHighContrastMode = false;
				this._applyBodyHighContrastModeCssClasses();
			}
		});
	}
	getHighContrastMode() {
		if (!this._platform.isBrowser) return HighContrastMode.NONE;
		const testElement = this._document.createElement("div");
		testElement.style.backgroundColor = "rgb(1,2,3)";
		testElement.style.position = "absolute";
		this._document.body.appendChild(testElement);
		const documentWindow = this._document.defaultView || window;
		const computedStyle = documentWindow && documentWindow.getComputedStyle ? documentWindow.getComputedStyle(testElement) : null;
		const computedColor = (computedStyle && computedStyle.backgroundColor || "").replace(/ /g, "");
		testElement.remove();
		switch (computedColor) {
			case "rgb(0,0,0)":
			case "rgb(45,50,54)":
			case "rgb(32,32,32)": return HighContrastMode.WHITE_ON_BLACK;
			case "rgb(255,255,255)":
			case "rgb(255,250,239)": return HighContrastMode.BLACK_ON_WHITE;
		}
		return HighContrastMode.NONE;
	}
	ngOnDestroy() {
		this._breakpointSubscription.unsubscribe();
	}
	_applyBodyHighContrastModeCssClasses() {
		if (!this._hasCheckedHighContrastMode && this._platform.isBrowser && this._document.body) {
			const bodyClasses = this._document.body.classList;
			bodyClasses.remove(HIGH_CONTRAST_MODE_ACTIVE_CSS_CLASS, BLACK_ON_WHITE_CSS_CLASS, WHITE_ON_BLACK_CSS_CLASS);
			this._hasCheckedHighContrastMode = true;
			const mode = this.getHighContrastMode();
			if (mode === HighContrastMode.BLACK_ON_WHITE) bodyClasses.add(HIGH_CONTRAST_MODE_ACTIVE_CSS_CLASS, BLACK_ON_WHITE_CSS_CLASS);
			else if (mode === HighContrastMode.WHITE_ON_BLACK) bodyClasses.add(HIGH_CONTRAST_MODE_ACTIVE_CSS_CLASS, WHITE_ON_BLACK_CSS_CLASS);
		}
	}
	static ɵfac = function HighContrastModeDetector_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || HighContrastModeDetector)();
	};
	static ɵprov = /* @__PURE__ */ ɵɵdefineService({
		token: HighContrastModeDetector,
		factory: HighContrastModeDetector.ɵfac
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(HighContrastModeDetector, [{ type: Service }], () => [], null);
})();
var A11yModule = class A11yModule {
	constructor() {
		inject(HighContrastModeDetector)._applyBodyHighContrastModeCssClasses();
	}
	static ɵfac = function A11yModule_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || A11yModule)();
	};
	static ɵmod = /* @__PURE__ */ ɵɵdefineNgModule({
		type: A11yModule,
		imports: [
			ObserversModule,
			CdkAriaLive,
			CdkTrapFocus,
			CdkMonitorFocus
		],
		exports: [
			CdkAriaLive,
			CdkTrapFocus,
			CdkMonitorFocus
		]
	});
	static ɵinj = /* @__PURE__ */ ɵɵdefineInjector({ imports: [ObserversModule] });
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(A11yModule, [{
		type: NgModule,
		args: [{
			imports: [
				ObserversModule,
				CdkAriaLive,
				CdkTrapFocus,
				CdkMonitorFocus
			],
			exports: [
				CdkAriaLive,
				CdkTrapFocus,
				CdkMonitorFocus
			]
		}]
	}], () => [], null);
})();
//#endregion
//#region ../../scheduler1/next/node_modules/@angular/cdk/fesm2022/dialog.mjs
function CdkDialogContainer_ng_template_0_Template(rf, ctx) {}
var DialogConfig = class {
	viewContainerRef;
	injector;
	id;
	role = "dialog";
	panelClass = "";
	hasBackdrop = true;
	backdropClass = "";
	disableClose = false;
	closePredicate;
	width = "";
	height = "";
	minWidth;
	minHeight;
	maxWidth;
	maxHeight;
	positionStrategy;
	data = null;
	direction;
	ariaDescribedBy = null;
	ariaLabelledBy = null;
	ariaLabel = null;
	ariaModal = false;
	autoFocus = "first-tabbable";
	restoreFocus = true;
	scrollStrategy;
	closeOnNavigation = true;
	closeOnDestroy = true;
	closeOnOverlayDetachments = true;
	disableAnimations = false;
	providers;
	container;
	templateContext;
	bindings;
};
function throwDialogContentAlreadyAttachedError() {
	throw Error("Attempting to attach dialog content after content is already attached");
}
var CdkDialogContainer = class CdkDialogContainer extends BasePortalOutlet {
	_elementRef = inject(ElementRef);
	_focusTrapFactory = inject(FocusTrapFactory);
	_config;
	_interactivityChecker = inject(InteractivityChecker);
	_ngZone = inject(NgZone);
	_focusMonitor = inject(FocusMonitor);
	_renderer = inject(Renderer2);
	_changeDetectorRef = inject(ChangeDetectorRef);
	_injector = inject(Injector);
	_platform = inject(Platform);
	_document = inject(DOCUMENT);
	_portalOutlet;
	_focusTrapped = new Subject();
	_focusTrap = null;
	_elementFocusedBeforeDialogWasOpened = null;
	_closeInteractionType = null;
	_ariaLabelledByQueue = [];
	_isDestroyed = false;
	constructor() {
		super();
		this._config = inject(DialogConfig, { optional: true }) || new DialogConfig();
		if (this._config.ariaLabelledBy) this._ariaLabelledByQueue.push(this._config.ariaLabelledBy);
	}
	_addAriaLabelledBy(id) {
		this._ariaLabelledByQueue.push(id);
		this._changeDetectorRef.markForCheck();
	}
	_removeAriaLabelledBy(id) {
		const index = this._ariaLabelledByQueue.indexOf(id);
		if (index > -1) {
			this._ariaLabelledByQueue.splice(index, 1);
			this._changeDetectorRef.markForCheck();
		}
	}
	_contentAttached() {
		this._initializeFocusTrap();
		this._captureInitialFocus();
	}
	_captureInitialFocus() {
		this._trapFocus();
	}
	ngOnDestroy() {
		this._focusTrapped.complete();
		this._isDestroyed = true;
		this._restoreFocus();
	}
	attachComponentPortal(portal) {
		if (this._portalOutlet.hasAttached() && (typeof ngDevMode === "undefined" || ngDevMode)) throwDialogContentAlreadyAttachedError();
		const result = this._portalOutlet.attachComponentPortal(portal);
		this._contentAttached();
		return result;
	}
	attachTemplatePortal(portal) {
		if (this._portalOutlet.hasAttached() && (typeof ngDevMode === "undefined" || ngDevMode)) throwDialogContentAlreadyAttachedError();
		const result = this._portalOutlet.attachTemplatePortal(portal);
		this._contentAttached();
		return result;
	}
	attachDomPortal = (portal) => {
		if (this._portalOutlet.hasAttached() && (typeof ngDevMode === "undefined" || ngDevMode)) throwDialogContentAlreadyAttachedError();
		const result = this._portalOutlet.attachDomPortal(portal);
		this._contentAttached();
		return result;
	};
	_recaptureFocus() {
		if (!this._containsFocus()) this._trapFocus();
	}
	_forceFocus(element, options) {
		if (!this._interactivityChecker.isFocusable(element)) {
			element.tabIndex = -1;
			this._ngZone.runOutsideAngular(() => {
				const callback = () => {
					deregisterBlur();
					deregisterMousedown();
					element.removeAttribute("tabindex");
				};
				const deregisterBlur = this._renderer.listen(element, "blur", callback);
				const deregisterMousedown = this._renderer.listen(element, "mousedown", callback);
			});
		}
		element.focus(options);
	}
	_focusByCssSelector(selector, options) {
		let elementToFocus = this._elementRef.nativeElement.querySelector(selector);
		if (elementToFocus) this._forceFocus(elementToFocus, options);
	}
	_trapFocus(options) {
		if (this._isDestroyed) return;
		afterNextRender(() => {
			const element = this._elementRef.nativeElement;
			switch (this._config.autoFocus) {
				case false:
				case "dialog":
					if (!this._containsFocus()) element.focus(options);
					break;
				case true:
				case "first-tabbable":
					if (!this._focusTrap?.focusInitialElement(options)) this._focusDialogContainer(options);
					break;
				case "first-heading":
					this._focusByCssSelector("h1, h2, h3, h4, h5, h6, [role=\"heading\"]", options);
					break;
				default:
					this._focusByCssSelector(this._config.autoFocus, options);
					break;
			}
			this._focusTrapped.next();
		}, { injector: this._injector });
	}
	_restoreFocus() {
		const focusConfig = this._config.restoreFocus;
		let focusTargetElement = null;
		if (typeof focusConfig === "string") focusTargetElement = this._document.querySelector(focusConfig);
		else if (typeof focusConfig === "boolean") focusTargetElement = focusConfig ? this._elementFocusedBeforeDialogWasOpened : null;
		else if (focusConfig) focusTargetElement = focusConfig;
		if (this._config.restoreFocus && focusTargetElement && typeof focusTargetElement.focus === "function") {
			const activeElement = _getFocusedElementPierceShadowDom();
			const element = this._elementRef.nativeElement;
			if (!activeElement || activeElement === this._document.body || activeElement === element || element.contains(activeElement)) if (this._focusMonitor) {
				this._focusMonitor.focusVia(focusTargetElement, this._closeInteractionType);
				this._closeInteractionType = null;
			} else focusTargetElement.focus();
		}
		if (this._focusTrap) this._focusTrap.destroy();
	}
	_focusDialogContainer(options) {
		this._elementRef.nativeElement.focus?.(options);
	}
	_containsFocus() {
		const element = this._elementRef.nativeElement;
		const activeElement = _getFocusedElementPierceShadowDom();
		return element === activeElement || element.contains(activeElement);
	}
	_initializeFocusTrap() {
		if (this._platform.isBrowser) {
			this._focusTrap = this._focusTrapFactory.create(this._elementRef.nativeElement);
			if (this._document) this._elementFocusedBeforeDialogWasOpened = _getFocusedElementPierceShadowDom();
		}
	}
	static ɵfac = function CdkDialogContainer_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || CdkDialogContainer)();
	};
	static ɵcmp = /* @__PURE__ */ ɵɵdefineComponent({
		type: CdkDialogContainer,
		selectors: [["cdk-dialog-container"]],
		viewQuery: function CdkDialogContainer_Query(rf, ctx) {
			if (rf & 1) ɵɵviewQuery(CdkPortalOutlet, 7);
			if (rf & 2) {
				let _t;
				ɵɵqueryRefresh(_t = ɵɵloadQuery()) && (ctx._portalOutlet = _t.first);
			}
		},
		hostAttrs: [
			"tabindex",
			"-1",
			1,
			"cdk-dialog-container"
		],
		hostVars: 6,
		hostBindings: function CdkDialogContainer_HostBindings(rf, ctx) {
			if (rf & 2) ɵɵattribute("id", ctx._config.id || null)("role", ctx._config.role)("aria-modal", ctx._config.ariaModal)("aria-labelledby", ctx._config.ariaLabel ? null : ctx._ariaLabelledByQueue[0])("aria-label", ctx._config.ariaLabel)("aria-describedby", ctx._config.ariaDescribedBy || null);
		},
		features: [ɵɵInheritDefinitionFeature],
		decls: 1,
		vars: 0,
		consts: [["cdkPortalOutlet", ""]],
		template: function CdkDialogContainer_Template(rf, ctx) {
			if (rf & 1) ɵɵtemplate(0, CdkDialogContainer_ng_template_0_Template, 0, 0, "ng-template", 0);
		},
		dependencies: [CdkPortalOutlet],
		styles: [".cdk-dialog-container {\n  display: block;\n  width: 100%;\n  height: 100%;\n  min-height: inherit;\n  max-height: inherit;\n}\n"],
		encapsulation: 2,
		changeDetection: 1
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(CdkDialogContainer, [{
		type: Component,
		args: [{
			selector: "cdk-dialog-container",
			encapsulation: ViewEncapsulation.None,
			changeDetection: ChangeDetectionStrategy.Eager,
			imports: [CdkPortalOutlet],
			host: {
				"class": "cdk-dialog-container",
				"tabindex": "-1",
				"[attr.id]": "_config.id || null",
				"[attr.role]": "_config.role",
				"[attr.aria-modal]": "_config.ariaModal",
				"[attr.aria-labelledby]": "_config.ariaLabel ? null : _ariaLabelledByQueue[0]",
				"[attr.aria-label]": "_config.ariaLabel",
				"[attr.aria-describedby]": "_config.ariaDescribedBy || null"
			},
			template: "<ng-template cdkPortalOutlet />\n",
			styles: [".cdk-dialog-container {\n  display: block;\n  width: 100%;\n  height: 100%;\n  min-height: inherit;\n  max-height: inherit;\n}\n"]
		}]
	}], () => [], { _portalOutlet: [{
		type: ViewChild,
		args: [CdkPortalOutlet, { static: true }]
	}] });
})();
var DialogRef = class {
	overlayRef;
	config;
	componentInstance = null;
	componentRef = null;
	containerInstance;
	disableClose;
	closed = new Subject();
	backdropClick;
	keydownEvents;
	outsidePointerEvents;
	id;
	_detachSubscription;
	constructor(overlayRef, config) {
		this.overlayRef = overlayRef;
		this.config = config;
		this.disableClose = config.disableClose;
		this.backdropClick = overlayRef.backdropClick();
		this.keydownEvents = overlayRef.keydownEvents();
		this.outsidePointerEvents = overlayRef.outsidePointerEvents();
		this.id = config.id;
		this.keydownEvents.subscribe((event) => {
			if (event.keyCode === 27 && !this.disableClose && !hasModifierKey(event)) {
				event.preventDefault();
				this.close(void 0, { focusOrigin: "keyboard" });
			}
		});
		this.backdropClick.subscribe(() => {
			if (!this.disableClose && this._canClose()) this.close(void 0, { focusOrigin: "mouse" });
			else this.containerInstance._recaptureFocus?.();
		});
		this._detachSubscription = overlayRef.detachments().subscribe(() => {
			if (config.closeOnOverlayDetachments !== false) this.close();
		});
	}
	close(result, options) {
		if (this._canClose(result)) {
			const closedSubject = this.closed;
			this.containerInstance._closeInteractionType = options?.focusOrigin || "program";
			this._detachSubscription.unsubscribe();
			this.overlayRef.dispose();
			closedSubject.next(result);
			closedSubject.complete();
			this.componentInstance = this.containerInstance = null;
		}
	}
	updatePosition() {
		this.overlayRef.updatePosition();
		return this;
	}
	updateSize(width = "", height = "") {
		this.overlayRef.updateSize({
			width,
			height
		});
		return this;
	}
	addPanelClass(classes) {
		this.overlayRef.addPanelClass(classes);
		return this;
	}
	removePanelClass(classes) {
		this.overlayRef.removePanelClass(classes);
		return this;
	}
	_canClose(result) {
		const config = this.config;
		return !!this.containerInstance && (!config.closePredicate || config.closePredicate(result, config, this.componentInstance));
	}
};
var DIALOG_SCROLL_STRATEGY = new InjectionToken("DialogScrollStrategy", {
	providedIn: "root",
	factory: () => {
		const injector = inject(Injector);
		return () => createBlockScrollStrategy(injector);
	}
});
var DIALOG_DATA = new InjectionToken("DialogData");
var DEFAULT_DIALOG_CONFIG = new InjectionToken("DefaultDialogConfig");
function getDirectionality(value) {
	const valueSignal = signal(value, ...ngDevMode ? [{ debugName: "valueSignal" }] : []);
	const change = new EventEmitter();
	return {
		valueSignal,
		get value() {
			return valueSignal();
		},
		change,
		ngOnDestroy() {
			change.complete();
		}
	};
}
var Dialog = class Dialog {
	_injector = inject(Injector);
	_defaultOptions = inject(DEFAULT_DIALOG_CONFIG, { optional: true });
	_parentDialog = inject(Dialog, {
		optional: true,
		skipSelf: true
	});
	_overlayContainer = inject(OverlayContainer);
	_idGenerator = inject(_IdGenerator);
	_openDialogsAtThisLevel = [];
	_afterAllClosedAtThisLevel = new Subject();
	_afterOpenedAtThisLevel = new Subject();
	_ariaHiddenElements = /* @__PURE__ */ new Map();
	_scrollStrategy = inject(DIALOG_SCROLL_STRATEGY);
	get openDialogs() {
		return this._parentDialog ? this._parentDialog.openDialogs : this._openDialogsAtThisLevel;
	}
	get afterOpened() {
		return this._parentDialog ? this._parentDialog.afterOpened : this._afterOpenedAtThisLevel;
	}
	afterAllClosed = defer(() => this.openDialogs.length ? this._getAfterAllClosed() : this._getAfterAllClosed().pipe(startWith(void 0)));
	open(componentOrTemplateRef, config) {
		config = {
			...this._defaultOptions || new DialogConfig(),
			...config
		};
		config.id = config.id || this._idGenerator.getId("cdk-dialog-");
		if (config.id && this.getDialogById(config.id) && (typeof ngDevMode === "undefined" || ngDevMode)) throw Error(`Dialog with id "${config.id}" exists already. The dialog id must be unique.`);
		const overlayConfig = this._getOverlayConfig(config);
		const overlayRef = createOverlayRef(this._injector, overlayConfig);
		const dialogRef = new DialogRef(overlayRef, config);
		const dialogContainer = this._attachContainer(overlayRef, dialogRef, config);
		dialogRef.containerInstance = dialogContainer;
		if (!this.openDialogs.length) {
			const overlayContainer = this._overlayContainer.getContainerElement();
			if (dialogContainer._focusTrapped) dialogContainer._focusTrapped.pipe(take(1)).subscribe(() => {
				this._hideNonDialogContentFromAssistiveTechnology(overlayContainer);
			});
			else this._hideNonDialogContentFromAssistiveTechnology(overlayContainer);
		}
		this._attachDialogContent(componentOrTemplateRef, dialogRef, dialogContainer, config);
		this.openDialogs.push(dialogRef);
		dialogRef.closed.subscribe(() => this._removeOpenDialog(dialogRef, true));
		this.afterOpened.next(dialogRef);
		return dialogRef;
	}
	closeAll() {
		reverseForEach(this.openDialogs, (dialog) => dialog.close());
	}
	getDialogById(id) {
		return this.openDialogs.find((dialog) => dialog.id === id);
	}
	ngOnDestroy() {
		reverseForEach(this._openDialogsAtThisLevel, (dialog) => {
			if (dialog.config.closeOnDestroy === false) this._removeOpenDialog(dialog, false);
		});
		reverseForEach(this._openDialogsAtThisLevel, (dialog) => dialog.close());
		this._afterAllClosedAtThisLevel.complete();
		this._afterOpenedAtThisLevel.complete();
		this._openDialogsAtThisLevel = [];
	}
	_getOverlayConfig(config) {
		const state = new OverlayConfig({
			positionStrategy: config.positionStrategy || createGlobalPositionStrategy().centerHorizontally().centerVertically(),
			scrollStrategy: config.scrollStrategy || this._scrollStrategy(),
			panelClass: config.panelClass,
			hasBackdrop: config.hasBackdrop,
			direction: config.direction,
			minWidth: config.minWidth,
			minHeight: config.minHeight,
			maxWidth: config.maxWidth,
			maxHeight: config.maxHeight,
			width: config.width,
			height: config.height,
			disposeOnNavigation: config.closeOnNavigation,
			disableAnimations: config.disableAnimations
		});
		if (config.backdropClass) state.backdropClass = config.backdropClass;
		return state;
	}
	_attachContainer(overlay, dialogRef, config) {
		const userInjector = config.injector || config.viewContainerRef?.injector;
		const providers = [
			{
				provide: DialogConfig,
				useValue: config
			},
			{
				provide: DialogRef,
				useValue: dialogRef
			},
			{
				provide: OverlayRef,
				useValue: overlay
			}
		];
		let containerType;
		if (config.container) if (typeof config.container === "function") containerType = config.container;
		else {
			containerType = config.container.type;
			providers.push(...config.container.providers(config));
		}
		else containerType = CdkDialogContainer;
		const containerPortal = new ComponentPortal(containerType, config.viewContainerRef, Injector.create({
			parent: userInjector || this._injector,
			providers
		}));
		return overlay.attach(containerPortal).instance;
	}
	_attachDialogContent(componentOrTemplateRef, dialogRef, dialogContainer, config) {
		if (componentOrTemplateRef instanceof TemplateRef) {
			const injector = this._createInjector(config, dialogRef, dialogContainer, void 0);
			let context = {
				$implicit: config.data,
				dialogRef
			};
			if (config.templateContext) context = {
				...context,
				...typeof config.templateContext === "function" ? config.templateContext() : config.templateContext
			};
			dialogContainer.attachTemplatePortal(new TemplatePortal(componentOrTemplateRef, null, context, injector));
		} else {
			const injector = this._createInjector(config, dialogRef, dialogContainer, this._injector);
			const contentRef = dialogContainer.attachComponentPortal(new ComponentPortal(componentOrTemplateRef, config.viewContainerRef, injector, null, config.bindings));
			dialogRef.componentRef = contentRef;
			dialogRef.componentInstance = contentRef.instance;
		}
	}
	_createInjector(config, dialogRef, dialogContainer, fallbackInjector) {
		const userInjector = config.injector || config.viewContainerRef?.injector;
		const providers = [{
			provide: DIALOG_DATA,
			useValue: config.data
		}, {
			provide: DialogRef,
			useValue: dialogRef
		}];
		if (config.providers) if (typeof config.providers === "function") providers.push(...config.providers(dialogRef, config, dialogContainer));
		else providers.push(...config.providers);
		if (config.direction && (!userInjector || !userInjector.get(Directionality, null, { optional: true }))) providers.push({
			provide: Directionality,
			useValue: getDirectionality(config.direction)
		});
		return Injector.create({
			parent: userInjector || fallbackInjector,
			providers
		});
	}
	_removeOpenDialog(dialogRef, emitEvent) {
		const index = this.openDialogs.indexOf(dialogRef);
		if (index > -1) {
			this.openDialogs.splice(index, 1);
			if (!this.openDialogs.length) {
				this._ariaHiddenElements.forEach((previousValue, element) => {
					if (previousValue) element.setAttribute("aria-hidden", previousValue);
					else element.removeAttribute("aria-hidden");
				});
				this._ariaHiddenElements.clear();
				if (emitEvent) this._getAfterAllClosed().next();
			}
		}
	}
	_hideNonDialogContentFromAssistiveTechnology(overlayContainer) {
		if (overlayContainer.parentElement) {
			const siblings = overlayContainer.parentElement.children;
			for (let i = siblings.length - 1; i > -1; i--) {
				const sibling = siblings[i];
				if (sibling !== overlayContainer && sibling.nodeName !== "SCRIPT" && sibling.nodeName !== "STYLE" && !sibling.hasAttribute("aria-live") && !sibling.hasAttribute("popover")) {
					this._ariaHiddenElements.set(sibling, sibling.getAttribute("aria-hidden"));
					sibling.setAttribute("aria-hidden", "true");
				}
			}
		}
	}
	_getAfterAllClosed() {
		const parent = this._parentDialog;
		return parent ? parent._getAfterAllClosed() : this._afterAllClosedAtThisLevel;
	}
	static ɵfac = function Dialog_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || Dialog)();
	};
	static ɵprov = /* @__PURE__ */ ɵɵdefineService({
		token: Dialog,
		factory: Dialog.ɵfac
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(Dialog, [{ type: Service }], null, null);
})();
function reverseForEach(items, callback) {
	let i = items.length;
	while (i--) callback(items[i]);
}
var DialogModule = class DialogModule {
	static ɵfac = function DialogModule_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || DialogModule)();
	};
	static ɵmod = /* @__PURE__ */ ɵɵdefineNgModule({
		type: DialogModule,
		imports: [
			OverlayModule,
			PortalModule,
			A11yModule,
			CdkDialogContainer
		],
		exports: [PortalModule, CdkDialogContainer]
	});
	static ɵinj = /* @__PURE__ */ ɵɵdefineInjector({
		providers: [Dialog],
		imports: [
			OverlayModule,
			PortalModule,
			A11yModule,
			PortalModule
		]
	});
};
(() => {
	(typeof ngDevMode === "undefined" || ngDevMode) && setClassMetadata(DialogModule, [{
		type: NgModule,
		args: [{
			imports: [
				OverlayModule,
				PortalModule,
				A11yModule,
				CdkDialogContainer
			],
			exports: [PortalModule, CdkDialogContainer],
			providers: [Dialog]
		}]
	}], null, null);
})();
//#endregion
export { CdkDialogContainer, DEFAULT_DIALOG_CONFIG, DIALOG_DATA, DIALOG_SCROLL_STRATEGY, Dialog, DialogConfig, DialogModule, DialogRef, throwDialogContentAlreadyAttachedError, CdkPortal as ɵɵCdkPortal, CdkPortalOutlet as ɵɵCdkPortalOutlet };
