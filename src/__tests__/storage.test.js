import { describe, it, expect } from 'vitest';
import { signRead, canonicalQuery, encodeKey } from '../../server/storage/sigv4.js';
import { parseListBuckets, parseListObjects } from '../../server/storage/registry.js';

// The two pieces of the object browser that are pure and easy to get subtly
// wrong: the signature, which fails as "AccessDenied" and reads like bad
// credentials, and the XML, which fails by quietly returning the wrong rows.

describe('SigV4 canonicalisation', () => {
  // Every separator kept literal, everything else encoded -- S3 signs the
  // path this way and a mismatch is rejected as a signature error.
  it('encodes each key segment but not the separators', () => {
    expect(encodeKey('reports/2026 Q1/summary.pdf')).toBe('reports/2026%20Q1/summary.pdf');
  });

  // encodeURIComponent leaves these alone; S3 expects them encoded.
  it("encodes the characters encodeURIComponent skips", () => {
    expect(encodeKey("a!b'c(d)e*f")).toBe('a%21b%27c%28d%29e%2Af');
  });

  // Sorting is part of the protocol, not tidiness: the signature is computed
  // over the sorted form, so an unsorted query fails to verify.
  it('sorts query parameters by key', () => {
    expect(canonicalQuery({ prefix: 'a', delimiter: '/', 'list-type': 2 }))
      .toBe('delimiter=%2F&list-type=2&prefix=a');
  });

  // Empty values are dropped rather than sent as "token=" -- S3 treats an
  // empty continuation token as a malformed one.
  it('drops empty and absent values', () => {
    expect(canonicalQuery({ 'max-keys': 50, token: '', prefix: undefined })).toBe('max-keys=50');
  });

  // The method is part of the canonical request, so signing a HEAD as a GET
  // is a signature mismatch that reads like a credentials problem.
  it('signs GET and HEAD differently', () => {
    const args = {
      accessKey: 'AKIA', secretKey: 'secret', region: 'us-east-1',
      host: 'localhost:9000', path: '/bucket/key', now: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
    };
    const get = signRead({ ...args, method: 'GET' }).authorization;
    const head = signRead({ ...args, method: 'HEAD' }).authorization;
    expect(get).not.toBe(head);
  });

  // Same inputs and same clock must give the same signature, or nothing about
  // this is debuggable.
  it('is deterministic for a fixed clock', () => {
    const args = {
      accessKey: 'AKIA', secretKey: 'secret', region: 'us-east-1',
      host: 'localhost:9000', path: '/', now: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)),
    };
    expect(signRead(args).authorization).toBe(signRead(args).authorization);
    expect(signRead(args)['x-amz-date']).toBe('20260102T030405Z');
  });

  // The published AWS vector, "Example: GET Bucket Lifecycle" -- chosen
  // because its signed headers are exactly ours. If this passes, the hash
  // chain, the canonical request and the scope are all right; everything else
  // in this file is about how they are fed.
  it('matches the AWS reference signature', () => {
    const { authorization } = signRead({
      method: 'GET',
      accessKey: 'AKIAIOSFODNN7EXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/',
      // Passed directly: canonicalQuery drops empty values, so it would
      // render this flag parameter as "" rather than "lifecycle=". That is
      // deliberate -- an empty continuation token must not be sent -- and it
      // is why no caller here signs a flag-style query.
      query: 'lifecycle=',
      now: new Date(Date.UTC(2013, 4, 24)),
    });
    expect(authorization).toContain(
      'Signature=fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543'
    );
  });

  // The credential scope carries the date and region; a wrong scope is the
  // other common way this fails.
  it('scopes the credential to the date and region', () => {
    const { authorization } = signRead({
      accessKey: 'AKIA', secretKey: 'secret', region: 'eu-west-1',
      host: 'h', path: '/', now: new Date(Date.UTC(2026, 8, 19)),
    });
    expect(authorization).toContain('Credential=AKIA/20260919/eu-west-1/s3/aws4_request');
    expect(authorization).toContain('SignedHeaders=host;x-amz-content-sha256;x-amz-date');
  });
});

describe('parsing S3 listings', () => {
  it('reads buckets and sorts them by name', () => {
    const xml = `<ListAllMyBucketsResult><Buckets>
      <Bucket><Name>zulu</Name><CreationDate>2026-09-14T16:35:20.727Z</CreationDate></Bucket>
      <Bucket><Name>alpha</Name><CreationDate>2026-09-14T16:35:21.149Z</CreationDate></Bucket>
    </Buckets></ListAllMyBucketsResult>`;
    expect(parseListBuckets(xml).map((b) => b.name)).toEqual(['alpha', 'zulu']);
  });

  // MinIO returns an ETag's surrounding quotes as &#34;, not &quot;. Without
  // numeric-entity decoding the quotes survive and every ETag renders wearing
  // them -- which is exactly what happened the first time this ran live.
  it('decodes numeric entities so the ETag loses its quotes', () => {
    const xml = `<ListBucketResult><Contents>
      <Key>a.png</Key><Size>10</Size>
      <ETag>&#34;abc123&#34;</ETag><StorageClass>STANDARD</StorageClass>
    </Contents></ListBucketResult>`;
    expect(parseListObjects(xml).objects[0].etag).toBe('abc123');
  });

  // Keys legitimately contain & and <, and S3 escapes them on the way out.
  it('decodes escaped characters in a key', () => {
    const xml = `<ListBucketResult><Contents>
      <Key>a&amp;b/c&lt;d&gt;.txt</Key><Size>1</Size>
    </Contents></ListBucketResult>`;
    expect(parseListObjects(xml).objects[0].key).toBe('a&b/c<d>.txt');
  });

  // Folders come back separately from objects, and the prefix itself is
  // returned as a zero-byte key -- listing it as a row would duplicate the
  // folder the reader just opened.
  it('separates folders from objects and drops the self-prefix', () => {
    const xml = `<ListBucketResult>
      <CommonPrefixes><Prefix>logs/2026/</Prefix></CommonPrefixes>
      <Contents><Key>logs/</Key><Size>0</Size></Contents>
      <Contents><Key>logs/a.txt</Key><Size>12</Size></Contents>
    </ListBucketResult>`;
    const page = parseListObjects(xml, 'logs/');
    expect(page.prefixes).toEqual(['logs/2026/']);
    expect(page.objects.map((o) => o.key)).toEqual(['logs/a.txt']);
  });

  // "true" is text here; this is XML, and a truthiness check on the string
  // "false" would page forever.
  it('reads truncation as text, not truthiness', () => {
    const t = `<R><IsTruncated>true</IsTruncated><NextContinuationToken>tok</NextContinuationToken></R>`;
    const f = `<R><IsTruncated>false</IsTruncated></R>`;
    expect(parseListObjects(t).truncated).toBe(true);
    expect(parseListObjects(t).nextToken).toBe('tok');
    expect(parseListObjects(f).truncated).toBe(false);
  });

  it('returns empty collections for an empty bucket', () => {
    const page = parseListObjects('<ListBucketResult></ListBucketResult>');
    expect(page.objects).toEqual([]);
    expect(page.prefixes).toEqual([]);
    expect(page.truncated).toBe(false);
  });
});
