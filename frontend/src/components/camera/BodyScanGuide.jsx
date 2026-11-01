import { Camera } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import './BodyScanGuide.css';

export default function BodyScanGuide() {
  const id = `body-guide-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const drawingRef = useRef(null);
  const [angleFontSize, setAngleFontSize] = useState(30);

  useEffect(() => {
    const drawing = drawingRef.current;
    const resize = () => {
      const bounds = drawing.getBoundingClientRect();
      const scale = Math.min(bounds.width / 600, bounds.height / 900);
      if (scale > 0) setAngleFontSize(Math.round(Math.max(30, Math.min(72, 12 / scale))));
    };
    resize();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(resize);
      observer.observe(drawing);
      return () => observer.disconnect();
    }
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  return (
    <div className="camera-body-guide" aria-hidden="true">
      <svg ref={drawingRef} className="camera-body-guide__drawing" viewBox="0 0 600 900" preserveAspectRatio="xMidYMid meet" fill="none" focusable="false" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`${id}-volume`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0066FF" stopOpacity="0.13" />
            <stop offset="0.23" stopColor="#67E8FF" stopOpacity="0.07" />
            <stop offset="0.5" stopColor="#67E8FF" stopOpacity="0.015" />
            <stop offset="0.8" stopColor="#00B8FF" stopOpacity="0.06" />
            <stop offset="1" stopColor="#0066FF" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#67E8FF" />
            <stop offset="0.48" stopColor="#00B8FF" />
            <stop offset="1" stopColor="#0066FF" />
          </linearGradient>
          <filter id={`${id}-glow`} x="-35%" y="-20%" width="170%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation="5" />
          </filter>
          <marker id={`${id}-arrow`} markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto-start-reverse">
            <path d="M2 1 6 4 2 7" stroke="#67E8FF" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
          <g id={`${id}-left-arm`}>
            <path d="M231 184 C214 181 201 195 192 215 L150 268 102 326 118 349 173 300 C200 272 229 245 239 218 Z" />
            <path d="M104 324 C98 328 93 332 87 339 L61 353 Q55 357 59 363 Q63 368 69 364 L79 357 50 394 Q45 399 49 403 Q53 407 58 401 L81 376 64 408 Q60 413 65 416 Q69 419 74 411 L95 383 83 413 Q80 418 85 420 Q90 422 94 414 L113 386 103 410 Q101 416 106 418 Q112 419 115 412 L132 373 C139 358 128 343 117 340 Z" />
          </g>
          <path id={`${id}-left-leg`} d="M244 425 C230 464 225 511 229 550 L230 607 C225 650 213 706 205 761 L202 779 C194 792 185 802 188 813 Q193 822 211 821 L246 819 Q259 816 255 805 L245 779 C251 742 259 702 270 662 L285 607 C292 563 299 513 300 465 Z" />
          <g id={`${id}-body`} strokeLinecap="round" strokeLinejoin="round">
            <use href={`#${id}-left-leg`} />
            <use href={`#${id}-left-leg`} transform="translate(600 0) scale(-1 1)" />
            <use href={`#${id}-left-arm`} />
            <use href={`#${id}-left-arm`} transform="translate(600 0) scale(-1 1)" />
            <path d="M278 134 C279 153 278 161 266 166 L239 176 C224 181 218 189 220 205 C226 239 237 263 243 290 L254 347 C253 378 238 408 240 435 C257 449 279 456 300 465 C321 456 343 449 360 435 C362 408 347 378 346 347 L357 290 C363 263 374 239 380 205 C382 189 376 181 361 176 L334 166 C322 161 321 153 322 134" />
            <path d="M259 82 C254 54 270 28 297 27 C325 25 344 48 342 79 L340 101 C338 122 326 144 303 146 C281 147 264 129 261 109 Z" />
            <path d="M260 83 C249 76 247 93 253 104 L262 116 M341 83 C352 76 354 93 348 104 L339 116" />
          </g>
        </defs>

        <use href={`#${id}-body`} stroke="#0066FF" strokeWidth="6" opacity="0.75" filter={`url(#${id}-glow)`} />
        <use href={`#${id}-body`} stroke="#0066FF" strokeWidth="3" opacity="0.9" />
        <use href={`#${id}-body`} fill={`url(#${id}-volume)`} stroke={`url(#${id}-rim)`} strokeWidth="1.6" />
        <use href={`#${id}-body`} stroke="#67E8FF" strokeWidth="0.7" opacity="0.88" />

        <g stroke="#67E8FF" strokeWidth="0.85" opacity="0.48" strokeLinecap="round">
          <path d="M275 45 C263 65 265 102 276 124 M327 44 C338 66 337 102 326 125 M281 153 272 176 M319 153 328 176" />
          <path d="M239 193 Q269 185 299 218 Q331 185 361 193 M236 222 Q268 245 294 229 M364 222 Q332 245 306 229 M250 275 Q270 293 283 295 M350 275 Q330 293 317 295 M265 337 Q300 350 335 337 M247 401 Q276 394 300 416 Q324 394 353 401" />
          <path d="M215 207 Q196 242 167 275 L120 329 M385 207 Q404 242 433 275 L480 329 M94 349 Q109 349 119 366 M506 349 Q491 349 481 366" />
          <path d="M254 457 Q247 511 253 563 Q242 588 245 613 M346 457 Q353 511 347 563 Q358 588 355 613 M248 645 Q229 716 223 773 M352 645 Q371 716 377 773 M204 795 Q225 790 245 802 M396 795 Q375 790 355 802" />
        </g>

        <g stroke="#00B8FF" strokeWidth="1.3" strokeDasharray="7 9" opacity="0.72">
          <path d="M300 25V862 M220 222H380 M250 385H350" />
          <path d="M214 217V383 M214 217 97 334 M386 217V383 M386 217 503 334" opacity="0.45" />
        </g>
        <g stroke="#0066FF" strokeWidth="5" opacity="0.4" filter={`url(#${id}-glow)`}>
          <path d="M214 383 A166 166 0 0 1 97 334 M386 383 A166 166 0 0 0 503 334 M235 850H365" />
        </g>
        <g stroke="#00B8FF" strokeWidth="2" markerStart={`url(#${id}-arrow)`} markerEnd={`url(#${id}-arrow)`}>
          <path d="M214 383 A166 166 0 0 1 97 334 M386 383 A166 166 0 0 0 503 334 M235 850H365" />
        </g>
        <g className="camera-body-guide__angle" fill="#67E8FF" textAnchor="middle" fontFamily="Tahoma, Arial, sans-serif" fontSize={angleFontSize} fontWeight="bold" direction="ltr">
          <text x="151" y="386">۴۵°</text>
          <text x="449" y="386">۴۵°</text>
        </g>
        <path className="camera-body-guide__corners-glow" d="M26 110V58Q26 28 56 28H110 M490 28H544Q574 28 574 58V110 M26 790V842Q26 872 56 872H110 M490 872H544Q574 872 574 842V790" stroke="#0066FF" strokeWidth="7" strokeLinecap="round" filter={`url(#${id}-glow)`} />
        <path d="M26 110V58Q26 28 56 28H110 M490 28H544Q574 28 574 58V110 M26 790V842Q26 872 56 872H110 M490 872H544Q574 872 574 842V790" stroke="#67E8FF" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div className="camera-body-guide__distance" dir="rtl">
        <Camera size={18} strokeWidth={1.8} />
        <span>فاصله پیشنهادی: ۱ متر</span>
      </div>
    </div>
  );
}
