import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CertificateStorageError, SupabaseCertificateStorage } from '../certificate-storage.js';

type UploadCall = {
  readonly path: string;
  readonly bufferSize: number;
};

type MockStorageOptions = {
  readonly uploadError?: { name: string; message: string };
  readonly publicUrlError?: { name: string; message: string };
  readonly missingPublicUrl?: boolean;
};

const createMockSupabaseClient = (options: MockStorageOptions = {}) => {
  let lastBucket: string | null = null;
  const uploadCalls: UploadCall[] = [];

  const storageApi = {
    upload: async (path: string, buffer: Buffer) => {
      uploadCalls.push({ path, bufferSize: buffer.length });
      if (options.uploadError) {
        return { data: null, error: options.uploadError };
      }
      return { data: { path }, error: null };
    },
    getPublicUrl: (path: string) => {
      if (options.publicUrlError) {
        throw options.publicUrlError;
      }
      if (options.missingPublicUrl) {
        return { data: { publicUrl: '' } };
      }
      return { data: { publicUrl: `https://cdn.example.com/${path}` } };
    },
  };

  const client = {
    storage: {
      from: (bucket: string) => {
        lastBucket = bucket;
        return storageApi;
      },
    },
    getLastBucket: () => lastBucket,
    getUploadCalls: () => uploadCalls,
  };

  return client;
};

test('uploads PDF to certificates bucket and returns public URL', async () => {
  const mockClient = createMockSupabaseClient();
  const storage = new SupabaseCertificateStorage(mockClient as unknown as SupabaseClient);

  const result = await storage.saveCertificatePdf({
    ticketId: 'abc-123',
    ticketNumber: 456,
    buffer: Buffer.from('pdf-bytes'),
  });

  assert.equal(result, 'https://cdn.example.com/certificates/456-abc-123.pdf');
  assert.equal(mockClient.getLastBucket(), 'certificates');
  assert.equal(mockClient.getUploadCalls()[0]?.path, 'certificates/456-abc-123.pdf');
});

test('wraps upload failures in CertificateStorageError', async () => {
  const uploadError = { name: 'StorageError', message: 'upload failed' };
  const mockClient = createMockSupabaseClient({ uploadError });
  const storage = new SupabaseCertificateStorage(mockClient as unknown as SupabaseClient);

  await assert.rejects(
    storage.saveCertificatePdf({
      ticketId: 'abc-123',
      ticketNumber: 456,
      buffer: Buffer.from('pdf-bytes'),
    }),
    (error: unknown) => {
      if (!(error instanceof CertificateStorageError)) {
        return false;
      }
      assert.equal(error.code, 'UPLOAD_FAILED');
      assert.equal(error.bucket, 'certificates');
      assert.equal(error.path, 'certificates/456-abc-123.pdf');
      assert.equal(error.originalError, uploadError);
      return true;
    }
  );
});

test('wraps URL generation failures in CertificateStorageError', async () => {
  const publicUrlError = { name: 'StorageError', message: 'url fail' };
  const mockClient = createMockSupabaseClient({ publicUrlError });
  const storage = new SupabaseCertificateStorage(mockClient as unknown as SupabaseClient);

  await assert.rejects(
    storage.saveCertificatePdf({
      ticketId: 'abc-123',
      ticketNumber: 456,
      buffer: Buffer.from('pdf-bytes'),
    }),
    (error: unknown) => {
      if (!(error instanceof CertificateStorageError)) {
        return false;
      }
      assert.equal(error.code, 'URL_GENERATION_FAILED');
      assert.equal(error.bucket, 'certificates');
      assert.equal(error.path, 'certificates/456-abc-123.pdf');
      assert.equal(error.originalError, publicUrlError);
      return true;
    }
  );
});

