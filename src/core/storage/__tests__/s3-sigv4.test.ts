import { sha256Hex, signV4 } from '../s3';
import { describe, expect, it } from 'vitest';

/**
 * Vectors from the AWS S3 docs, "Examples: Signature Calculations in AWS
 * Signature Version 4" (GET Object / PUT Object with the example credentials).
 * If canonicalization or the key-derivation chain drifts, these change.
 */
const CREDS = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 's3',
  date: new Date('2013-05-24T00:00:00Z'),
};

const EMPTY_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('signV4', () => {
  it('matches the AWS GET Object example signature', () => {
    const headers = signV4({
      ...CREDS,
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      headers: { Range: 'bytes=0-9' },
      payloadHash: EMPTY_HASH,
    });

    expect(headers['x-amz-date']).toBe('20130524T000000Z');
    expect(headers['authorization']).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41'
    );
  });

  it('matches the AWS PUT Object example signature', () => {
    const body = Buffer.from('Welcome to Amazon S3.', 'utf8');
    const headers = signV4({
      ...CREDS,
      method: 'PUT',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test$file.text',
      headers: {
        'x-amz-storage-class': 'REDUCED_REDUNDANCY',
        Date: 'Fri, 24 May 2013 00:00:00 GMT',
      },
      payloadHash: sha256Hex(body),
    });

    expect(headers['x-amz-content-sha256']).toBe(
      '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072'
    );
    expect(headers['authorization']).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class, ' +
        'Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd'
    );
  });

  it('percent-encodes path segments once and keeps slashes', () => {
    const a = signV4({
      ...CREDS,
      method: 'GET',
      host: 'h',
      path: '/b/a b.png',
      payloadHash: EMPTY_HASH,
    });
    const b = signV4({
      ...CREDS,
      method: 'GET',
      host: 'h',
      path: '/b/a%20b.png',
      payloadHash: EMPTY_HASH,
    });
    expect(a['authorization']).toBe(b['authorization']);
  });
});
