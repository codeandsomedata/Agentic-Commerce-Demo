import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface JsonHighlighterProps {
  data: unknown;
  highlightKeys?: string[];
  maxHeightClass?: string;
}

export function JsonHighlighter({
  data,
  highlightKeys = ['availability_status', 'merchant_controls', 'agent_checkout_allowed'],
  maxHeightClass = 'max-h-[420px]',
}: JsonHighlighterProps) {
  const [copied, setCopied] = useState(false);
  const formatted = JSON.stringify(data, null, 2) ?? 'null';
  const lines = formatted.split('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard fallback ignored cleanly
    }
  };

  return (
    <div className="relative rounded-lg border border-slate-700/80 bg-slate-950 overflow-hidden">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2.5 right-2.5 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors cursor-pointer"
        aria-label="Copy JSON"
      >
        {copied ? (
          <>
            <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
            <span className="text-emerald-300">Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-3 h-3" aria-hidden="true" />
            <span>Copy</span>
          </>
        )}
      </button>

      <div className={`overflow-auto dark-inspector-scroll p-4 pr-20 ${maxHeightClass}`}>
        <pre className="font-mono-tabular text-xs leading-5 text-slate-200 tracking-[0.01em]">
          {lines.map((line, index) => {
            const matchedKey = highlightKeys.find((k) => line.includes(`"${k}"`));
            const isOutOfStock = line.includes('"out_of_stock"') || line.includes('false');
            const isPositive = line.includes('"in_stock"') || line.includes('true');

            let lineHighlightClass = '';
            if (matchedKey) {
              if (isOutOfStock && (matchedKey === 'availability_status' || matchedKey === 'agent_checkout_allowed')) {
                lineHighlightClass = 'bg-rose-500/15 text-rose-200 -mx-4 px-4 block';
              } else if (isPositive && (matchedKey === 'availability_status' || matchedKey === 'agent_checkout_allowed')) {
                lineHighlightClass = 'bg-emerald-500/15 text-emerald-200 -mx-4 px-4 block';
              } else {
                lineHighlightClass = 'bg-blue-500/15 text-blue-200 -mx-4 px-4 block';
              }
            }

            return (
              <span key={index} className={lineHighlightClass || 'block'}>
                {line}
              </span>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
