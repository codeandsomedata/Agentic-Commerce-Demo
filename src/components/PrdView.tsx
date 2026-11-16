import { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  FileText,
  Copy,
  Check,
  ExternalLink,
  X,
} from 'lucide-react';
import {
  PRD_BLOCKS,
  PRD_DOCUMENT_TITLE,
  prdToPlainMarkdown,
} from '../data/prdDocument.ts';
import {
  authorizeGoogleDocs,
  clearGoogleDocsAccessToken,
  getGoogleDocsAccessToken,
} from '../lib/firebase.ts';
import {
  exportPrdToGoogleDoc,
  type CreatedGoogleDoc,
} from '../lib/googleDocsExport.ts';
import { ArchitectureDiagram } from './ArchitectureDiagram.tsx';

interface PrdViewProps {
  user: User | null;
}

export function PrdView({ user }: PrdViewProps) {
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [docTitle, setDocTitle] = useState(PRD_DOCUMENT_TITLE);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [createdDoc, setCreatedDoc] = useState<CreatedGoogleDoc | null>(null);

  const handleCopyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(prdToPlainMarkdown());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportError('Unable to copy markdown to clipboard.');
    }
  };

  const handleConfirmExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      let token = getGoogleDocsAccessToken();
      if (!token) {
        const authResult = await authorizeGoogleDocs();
        token = authResult.accessToken;
      }
      const result = await exportPrdToGoogleDoc(token, docTitle);
      setCreatedDoc(result);
      setConfirmOpen(false);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to export PRD to Google Docs.';
      const needsReauth =
        msg.includes('(401)') ||
        msg.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT') ||
        msg.includes('insufficient authentication scopes');
      if (needsReauth) {
        clearGoogleDocsAccessToken();
        try {
          const authResult = await authorizeGoogleDocs();
          const result = await exportPrdToGoogleDoc(authResult.accessToken, docTitle);
          setCreatedDoc(result);
          setConfirmOpen(false);
          return;
        } catch (retryErr) {
          setExportError(
            retryErr instanceof Error
              ? retryErr.message
              : 'Google Docs permission is required. Please check the Google Docs box on the consent popup.',
          );
          return;
        }
      }
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  };

  // Group contiguous bullets cleanly into <ul> lists while preserving block order
  const renderBlocks = () => {
    const elements: React.ReactNode[] = [];
    let bulletBuffer: { label?: string; text: string; key: number }[] = [];

    const flushBullets = (endIdx: number) => {
      if (bulletBuffer.length === 0) return;
      elements.push(
        <ul
          key={`ul_${endIdx}`}
          className="list-disc pl-5 space-y-2 text-sm text-slate-700 leading-relaxed"
        >
          {bulletBuffer.map((b) => (
            <li key={b.key}>
              {b.label ? (
                <>
                  <span className="font-semibold text-slate-900">{b.label}:</span>{' '}
                  <span>{b.text}</span>
                </>
              ) : (
                b.text
              )}
            </li>
          ))}
        </ul>,
      );
      bulletBuffer = [];
    };

    PRD_BLOCKS.forEach((block, idx) => {
      if (block.type === 'bullet') {
        bulletBuffer.push({ label: block.label, text: block.text, key: idx });
        return;
      }
      flushBullets(idx);
      if (block.type === 'h1') {
        elements.push(
          <h1
            key={idx}
            className="font-display text-2xl font-bold tracking-tight text-slate-900"
          >
            {block.text}
          </h1>,
        );
      } else if (block.type === 'h2') {
        elements.push(
          <h2
            key={idx}
            className="font-display text-lg font-semibold text-slate-900 pt-6 border-t border-slate-200"
          >
            {block.text}
          </h2>,
        );
      } else if (block.type === 'h3') {
        elements.push(
          <h3
            key={idx}
            className="font-display text-sm font-semibold text-slate-800 pt-2"
          >
            {block.text}
          </h3>,
        );
      } else if (block.type === 'diagram') {
        elements.push(
          <ArchitectureDiagram
            key={idx}
            title={block.title}
            lines={block.lines}
            caption={block.caption}
          />,
        );
      } else {
        elements.push(
          <p key={idx} className="text-sm text-slate-600 leading-relaxed">
            {block.text}
          </p>,
        );
      }
    });
    flushBullets(PRD_BLOCKS.length);
    return elements;
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Action Header */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileText className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
            <span>Product Requirements &amp; Technical Design</span>
          </div>
          <p className="text-xs text-slate-600">
            Includes workbench architecture, industry catalog maintenance (Google &amp; Microsoft patterns), Cloud Gemini vs. Browser LiteRT-LM (<span className="font-mono">@litert-lm/core</span>), data generation, and 3-tier eval principles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleCopyMarkdown()}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                <span>Copied Markdown</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Copy Markdown</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setExportError(null);
              setConfirmOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Export to Google Doc</span>
          </button>
        </div>
      </div>

      {/* Created Doc Banner */}
      {createdDoc && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-emerald-950">
              Google Doc Created
            </div>
            <div className="text-xs text-emerald-800">
              &ldquo;{createdDoc.title}&rdquo; has been written to your Google Docs account.
            </div>
          </div>
          <a
            href={createdDoc.documentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap"
          >
            <span>Open in Google Docs</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
      )}

      {exportError && !confirmOpen && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {exportError}
        </div>
      )}

      {/* Document Body */}
      <article className="rounded-xl border border-slate-200 bg-white p-8 space-y-4">
        {renderBlocks()}
      </article>

      {/* Explicit Confirmation Modal Before Creating Google Doc */}
      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-doc-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 px-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="export-doc-modal-title"
                  className="font-display text-base font-semibold text-slate-900"
                >
                  Create Google Doc?
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  This will create a new document in Google Docs{user?.email ? ` for ${user.email}` : ''} and write the complete PRD, dual-runtime design, data generation spec, and eval principles into it.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={exporting}
                aria-label="Close modal"
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="google-doc-title"
                className="block text-xs font-medium text-slate-700"
              >
                Document Title
              </label>
              <input
                id="google-doc-title"
                type="text"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                disabled={exporting}
                className="w-full px-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 focus:bg-white"
              />
            </div>

            {!getGoogleDocsAccessToken() && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[11px] text-slate-600 leading-relaxed">
                Clicking <strong>Confirm &amp; Create Doc</strong> will ask you to sign in / grant Google Docs permission if your session does not yet hold an active Google Docs token.
              </div>
            )}

            {exportError && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {exportError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={exporting}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={exporting || !docTitle.trim()}
                onClick={() => void handleConfirmExport()}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
              >
                {exporting ? 'Creating Google Doc...' : 'Confirm & Create Doc'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
