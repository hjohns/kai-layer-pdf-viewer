import { defineEventHandler } from 'h3';

const overlayPage1 = {
  overlay: [
    {
      page: '1',
      rect: [
        1.2296,
        0.6163,
        3.1505,
        0.6129,
        3.1508,
        0.7734,
        1.2299,
        0.7767
      ],
      content: 'CHAIN OF CUSTODY RECORD',
      line: 0
    },
    {
      page: '1',
      rect: [
        3.6133,
        0.6291,
        4.1275,
        0.6385,
        4.1258,
        0.7335,
        3.6116,
        0.7241
      ],
      content: 'Eurofins | mgt',
      line: 1
    }
  ]
};

const jsonLdPage8 = {
  '@context': {
    doc: 'https://example.org/document#',
    geom: 'https://example.org/geometry#',
    sdo: 'https://schema.org/'
  },
  '@graph': [
    {
      '@id': 'https://example.org/annotations/page-8/cell-1',
      '@type': 'doc:TableCell',
      'doc:content': 'Mock JSON-LD cell for page 8',
      'geom:hasGeometry': '2.5332,1.8968 4.4883,1.9002 4.4883,2.0938 2.5332,2.0904',
      'doc:row': { '@value': 1 },
      'doc:column': { '@value': 2 },
      'doc:confidence': { '@value': 0.92 },
      'sdo:isPartOf': { '@id': 'https://example.org/documents/demo-table' }
    }
  ]
};

const annotationStore: Record<number, unknown> = {
  1: overlayPage1,
  8: jsonLdPage8
};

export default defineEventHandler((event) => {
  const param = event.context.params?.page;
  const pageNumber = Number.parseInt(Array.isArray(param) ? param[0] : param ?? '0', 10);

  if (!Number.isFinite(pageNumber)) {
    return { overlay: [] };
  }

  const payload = annotationStore[pageNumber];
  if (!payload) {
    return { overlay: [] };
  }

  return payload;
});
