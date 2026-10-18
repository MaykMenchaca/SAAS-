(function () {
  if (customElements.get("lucide-icon")) return;
  var SRC = "https://unpkg.com/lucide@0.525.0/dist/umd/lucide.min.js";
  var waiters = [];
  function isReady() { return !!(window.lucide && window.lucide.icons); }
  function flush() { waiters.splice(0).forEach(function (f) { f(); }); }
  if (!isReady()) {
    var s = document.querySelector("script[data-lucide-umd]");
    if (!s) {
      s = document.createElement("script");
      s.src = SRC;
      s.setAttribute("data-lucide-umd", "1");
      document.head.appendChild(s);
    }
    s.addEventListener("load", flush);
  }
  var NS = "http://www.w3.org/2000/svg";
  function pascal(n) { return n.split("-").map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(""); }
  class LucideIcon extends HTMLElement {
    static get observedAttributes() { return ["name", "size", "stroke"]; }
    connectedCallback() {
      this._root = this.shadowRoot || this.attachShadow({ mode: "open" });
      var size = (this.getAttribute("size") || "16") + "px";
      this.style.display = "inline-flex";
      this.style.flex = "none";
      this.style.width = size;
      this.style.height = size;
      var self = this;
      if (isReady()) this.render(); else waiters.push(function () { self.render(); });
    }
    attributeChangedCallback() { if (this.isConnected && isReady()) this.render(); }
    render() {
      var name = this.getAttribute("name") || "";
      var size = this.getAttribute("size") || "16";
      var sw = this.getAttribute("stroke") || "1.5";
      this.style.width = size + "px";
      this.style.height = size + "px";
      if (!this._root) this._root = this.shadowRoot || this.attachShadow({ mode: "open" });
      var node = window.lucide.icons[pascal(name)];
      this._root.innerHTML = "";
      if (!node) return;
      var children = typeof node[0] === "string" ? node[2] || [] : node;
      var svg = document.createElementNS(NS, "svg");
      var a = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": sw, "stroke-linecap": "round", "stroke-linejoin": "round" };
      for (var k in a) svg.setAttribute(k, a[k]);
      children.forEach(function (c) {
        var el = document.createElementNS(NS, c[0]);
        for (var k2 in c[1]) el.setAttribute(k2, c[1][k2]);
        svg.appendChild(el);
      });
      svg.style.display = "block";
      this._root.appendChild(svg);
    }
  }
  customElements.define("lucide-icon", LucideIcon);
})();
