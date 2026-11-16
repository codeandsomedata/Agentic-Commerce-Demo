import { PRD_BLOCKS, PRD_DOCUMENT_TITLE } from '../data/prdDocument.ts';

export interface CreatedGoogleDoc {
  documentId: string;
  title: string;
  documentUrl: string;
}

interface DocsBatchRequest {
  insertText?: {
    location: { index: number };
    text: string;
  };
  updateParagraphStyle?: {
    range: { startIndex: number; endIndex: number };
    paragraphStyle: { namedStyleType: string };
    fields: string;
  };
  createParagraphBullets?: {
    range: { startIndex: number; endIndex: number };
    bulletPreset: string;
  };
  updateTextStyle?: {
    range: { startIndex: number; endIndex: number };
    textStyle: {
      bold?: boolean;
      italic?: boolean;
      weightedFontFamily?: { fontFamily: string };
      fontSize?: { magnitude: number; unit: string };
    };
    fields: string;
  };
}

export async function exportPrdToGoogleDoc(
  accessToken: string,
  customTitle?: string,
): Promise<CreatedGoogleDoc> {
  const title = (customTitle || PRD_DOCUMENT_TITLE).trim();

  // 1. Create empty Google Doc
  const createResp = await fetch('https://docs.googleapis.com/v1/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(
      `Failed to create Google Doc (${createResp.status}): ${errText}`,
    );
  }

  const created = (await createResp.json()) as {
    documentId: string;
    title: string;
  };

  // 2. Build deterministic UTF-16 index ranges for insert + formatting
  let fullText = '';
  let cursor = 1; // Google Docs body content starts at UTF-16 index 1

  const paragraphRequests: DocsBatchRequest[] = [];
  const bulletRanges: { startIndex: number; endIndex: number }[] = [];
  const boldRanges: { startIndex: number; endIndex: number }[] = [];
  const italicRanges: { startIndex: number; endIndex: number }[] = [];
  const monoRanges: { startIndex: number; endIndex: number }[] = [];

  let activeBulletStart: number | null = null;
  let activeBulletEnd: number | null = null;

  const flushBullets = () => {
    if (activeBulletStart !== null && activeBulletEnd !== null && activeBulletEnd > activeBulletStart) {
      bulletRanges.push({
        startIndex: activeBulletStart,
        endIndex: activeBulletEnd,
      });
    }
    activeBulletStart = null;
    activeBulletEnd = null;
  };

  for (const block of PRD_BLOCKS) {
    if (block.type === 'bullet') {
      const prefix = block.label ? `${block.label}: ` : '';
      const lineText = `${prefix}${block.text}\n`;
      const startIndex = cursor;
      const endIndex = cursor + lineText.length;

      if (activeBulletStart === null) {
        activeBulletStart = startIndex;
      }
      activeBulletEnd = endIndex;

      if (prefix.length > 0) {
        boldRanges.push({
          startIndex,
          endIndex: startIndex + prefix.length,
        });
      }

      fullText += lineText;
      cursor = endIndex;
    } else if (block.type === 'diagram') {
      flushBullets();
      const titleLine = `${block.title}\n`;
      boldRanges.push({
        startIndex: cursor,
        endIndex: cursor + titleLine.length,
      });
      fullText += titleLine;
      cursor += titleLine.length;

      const diagramText = `${block.lines.join('\n')}\n`;
      monoRanges.push({
        startIndex: cursor,
        endIndex: cursor + diagramText.length,
      });
      fullText += diagramText;
      cursor += diagramText.length;

      if (block.caption) {
        const captionLine = `${block.caption}\n`;
        italicRanges.push({
          startIndex: cursor,
          endIndex: cursor + captionLine.length,
        });
        fullText += captionLine;
        cursor += captionLine.length;
      }
    } else {
      flushBullets();
      const lineText = `${block.text}\n`;
      const startIndex = cursor;
      const endIndex = cursor + lineText.length;

      if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
        const namedStyleType =
          block.type === 'h1'
            ? 'HEADING_1'
            : block.type === 'h2'
              ? 'HEADING_2'
              : 'HEADING_3';
        paragraphRequests.push({
          updateParagraphStyle: {
            range: { startIndex, endIndex },
            paragraphStyle: { namedStyleType },
            fields: 'namedStyleType',
          },
        });
      }

      fullText += lineText;
      cursor = endIndex;
    }
  }
  flushBullets();

  const requests: DocsBatchRequest[] = [
    {
      insertText: {
        location: { index: 1 },
        text: fullText,
      },
    },
    ...paragraphRequests,
    ...bulletRanges.map((range) => ({
      createParagraphBullets: {
        range,
        bulletPreset: 'BULLET_DISC_CIRCLE_SQUARE',
      },
    })),
    ...boldRanges.map((range) => ({
      updateTextStyle: {
        range,
        textStyle: { bold: true },
        fields: 'bold',
      },
    })),
    ...italicRanges.map((range) => ({
      updateTextStyle: {
        range,
        textStyle: { italic: true },
        fields: 'italic',
      },
    })),
    ...monoRanges.map((range) => ({
      updateTextStyle: {
        range,
        textStyle: {
          weightedFontFamily: { fontFamily: 'Courier New' },
          fontSize: { magnitude: 8.5, unit: 'PT' },
        },
        fields: 'weightedFontFamily,fontSize',
      },
    })),
  ];

  // 3. Populate & style Google Doc via batchUpdate
  const batchResp = await fetch(
    `https://docs.googleapis.com/v1/documents/${created.documentId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    },
  );

  if (!batchResp.ok) {
    const errText = await batchResp.text();
    throw new Error(
      `Created doc (${created.documentId}) but failed to write content (${batchResp.status}): ${errText}`,
    );
  }

  return {
    documentId: created.documentId,
    title: created.title,
    documentUrl: `https://docs.google.com/document/d/${created.documentId}/edit`,
  };
}
