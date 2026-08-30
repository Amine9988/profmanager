const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "node_modules", "lucide-react");

const PATCHED_ICON = `"use strict";
"use client";
/**
 * @license lucide-react v1.24.0 - ISC
 * Patched: never emit aria-hidden (React 19 SSR omits it → hydration mismatch).
 */

import { forwardRef, createElement } from 'react';
import defaultAttributes from './defaultAttributes.mjs';
import { mergeClasses } from './shared/src/utils/mergeClasses.mjs';
import { useLucideContext } from './context.mjs';

const Icon = forwardRef(
  ({ color, size, strokeWidth, absoluteStrokeWidth, className = "", children, iconNode, ...rest }, ref) => {
    const {
      size: contextSize = 24,
      strokeWidth: contextStrokeWidth = 2,
      absoluteStrokeWidth: contextAbsoluteStrokeWidth = false,
      color: contextColor = "currentColor",
      className: contextClass = ""
    } = useLucideContext() ?? {};
    const calculatedStrokeWidth = absoluteStrokeWidth ?? contextAbsoluteStrokeWidth ? Number(strokeWidth ?? contextStrokeWidth) * 24 / Number(size ?? contextSize) : strokeWidth ?? contextStrokeWidth;
    const { "aria-hidden": _omitAriaHidden, ...safeRest } = rest;
    return createElement(
      "svg",
      {
        ref,
        ...defaultAttributes,
        width: size ?? contextSize ?? defaultAttributes.width,
        height: size ?? contextSize ?? defaultAttributes.height,
        stroke: color ?? contextColor,
        strokeWidth: calculatedStrokeWidth,
        className: mergeClasses("lucide", contextClass, className),
        suppressHydrationWarning: true,
        ...safeRest
      },
      [
        ...iconNode.map(([tag, attrs]) => createElement(tag, attrs)),
        ...Array.isArray(children) ? children : [children]
      ]
    );
  }
);

export { Icon as default };
`;

function patchFile(filePath, transform) {
  if (!fs.existsSync(filePath)) return false;
  const before = fs.readFileSync(filePath, "utf8");
  const after = transform(before);
  if (after !== before) {
    fs.writeFileSync(filePath, after);
    return true;
  }
  return false;
}

function stripAriaHidden(src) {
  return src
    .replace(
      /\n\s*\.\.\.!?children && !hasA11yProp\(rest\) && \{ "aria-hidden": "true" \},/g,
      ""
    )
    .replace(
      /\n\s*\.\.\.!\(Array\.isArray\(children\) \? children\.some\(Boolean\) : children\) && !hasA11yProp\(rest\) && \{ "aria-hidden": "true" \},/g,
      ""
    )
    .replace(
      /\n\s*\.\.\.!\(Array\.isArray\(children\) \? children\.length === 0 : !children\) && !hasA11yProp\(rest\) && \{ "aria-hidden": "true" \},/g,
      ""
    )
    .replace(/\n\s*"aria-hidden": "true",?/g, "")
    .replace(/,\n  "aria-hidden": "true"\n\};/g, "\n};");
}

const iconEsm = path.join(ROOT, "dist", "esm", "Icon.mjs");
if (fs.existsSync(iconEsm)) {
  fs.writeFileSync(iconEsm, PATCHED_ICON);
  console.log("[postinstall] wrote patched lucide Icon.mjs");
}

const lucideCjs = path.join(ROOT, "dist", "cjs", "lucide-react.js");
if (fs.existsSync(lucideCjs)) {
  let content = fs.readFileSync(lucideCjs, "utf8");
  if (!content.startsWith('"use client"')) {
    content = '"use client";' + content;
  }
  const stripped = stripAriaHidden(content);
  if (stripped !== content || !content.startsWith('"use client"')) {
    fs.writeFileSync(lucideCjs, stripped);
    console.log("[postinstall] stripped lucide CJS aria-hidden");
  }
}

const defaultAttrs = path.join(ROOT, "dist", "esm", "defaultAttributes.mjs");
if (patchFile(defaultAttrs, stripAriaHidden)) {
  console.log("[postinstall] stripped defaultAttributes aria-hidden");
}
