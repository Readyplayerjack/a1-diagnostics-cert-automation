/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict';
import test from 'node:test';
import type { JifelineApiClient } from '../../clients/jifeline-api-client.js';
import type {
  OpenAiExtractionClient,
  OpenAiExtractionResponse,
} from '../../clients/openai-extraction-client.js';
import {
  RealRegMileageExtractor,
  RegMileageSystemError,
  type RegMileageExtractionResult,
} from '../reg-mileage-extractor.js';

class StubJifelineApiClient implements Pick<JifelineApiClient, 'getTicketConversationText'> {
  // eslint-disable-next-line @typescript-eslint/class-methods-use-this
  async getTicketConversationText(_ticketId: string): Promise<string | null> {
    return null;
  }
}

class RecordingOpenAiClient implements OpenAiExtractionClient {
  public lastRequest: {
    conversationText: string;
    regexCandidates: {
      regs: string[];
      mileages: string[];
    };
  } | null = null;

  public response: OpenAiExtractionResponse = {
    vehicleRegistration: null,
    vehicleMileage: null,
    registrationConfidence: 0,
    mileageConfidence: 0,
    reasoning: 'stub',
  };

  async extractRegAndMileage(params: {
    conversationText: string;
    regexCandidates: { regs: string[]; mileages: string[] };
  }): Promise<OpenAiExtractionResponse> {
    this.lastRequest = params;
    return this.response;
  }
}

test('RealRegMileageExtractor uses regex-only path when single registration and mileage are present', async () => {
  const apiClient = new StubJifelineApiClient();
  const openAiClient = new RecordingOpenAiClient();
  const extractor = new RealRegMileageExtractor(
    apiClient as unknown as JifelineApiClient,
    openAiClient
  );

  const conversation =
    'Customer says the reg is AB12 CDE and the mileage is 45,000 miles on the clock.';

  const result: RegMileageExtractionResult = await extractor.extract({
    ticketId: 'ticket-1',
    ticketNumber: 123,
    conversationText: conversation,
  });

  assert.equal(result.vehicleRegistration, 'AB12 CDE');
  assert.equal(result.vehicleMileage, '45000');
  assert.ok(result.registrationConfidence >= 0.9);
  assert.ok(result.mileageConfidence >= 0.9);
  assert.equal(result.errors.length, 0);
  assert.equal(openAiClient.lastRequest, null);
});

test('RealRegMileageExtractor falls back to OpenAI when multiple candidates exist', async () => {
  const apiClient = new StubJifelineApiClient();
  const openAiClient = new RecordingOpenAiClient();
  openAiClient.response = {
    vehicleRegistration: 'XY34 ZZZ',
    vehicleMileage: '12345',
    registrationConfidence: 0.8,
    mileageConfidence: 0.85,
    reasoning: 'latest correction',
  };

  const extractor = new RealRegMileageExtractor(
    apiClient as unknown as JifelineApiClient,
    openAiClient
  );

  const conversation =
    'First they said reg AB12 CDE and 30,000 miles, later corrected to XY34 ZZZ with 12,345 miles.';

  const result: RegMileageExtractionResult = await extractor.extract({
    ticketId: 'ticket-2',
    ticketNumber: 456,
    conversationText: conversation,
  });

  assert.equal(result.vehicleRegistration, 'XY34 ZZZ');
  assert.equal(result.vehicleMileage, '12345');
  assert.ok(result.registrationConfidence <= 0.8 + 1e-6);
  assert.ok(result.mileageConfidence <= 0.85 + 1e-6);
  assert.ok(openAiClient.lastRequest);
  assert.ok(
    openAiClient.lastRequest?.regexCandidates.regs.length &&
      openAiClient.lastRequest.regexCandidates.mileages.length
  );
});

test('RealRegMileageExtractor validation rejects impossible mileage values', async () => {
  const apiClient = new StubJifelineApiClient();
  const openAiClient = new RecordingOpenAiClient();
  openAiClient.response = {
    vehicleRegistration: 'AB12 CDE',
    vehicleMileage: '9999999',
    registrationConfidence: 0.9,
    mileageConfidence: 0.9,
    reasoning: 'test',
  };

  const extractor = new RealRegMileageExtractor(
    apiClient as unknown as JifelineApiClient,
    openAiClient
  );

  const conversation = 'Customer provided details by phone.';

  const result: RegMileageExtractionResult = await extractor.extract({
    ticketId: 'ticket-3',
    ticketNumber: 789,
    conversationText: conversation,
  });

  assert.equal(result.vehicleRegistration, 'AB12 CDE');
  assert.equal(result.vehicleMileage, null);
  assert.ok(result.mileageConfidence <= 0.2);
  assert.ok(
    result.errors.some((error) => error.code === 'MILEAGE_INVALID_FORMAT')
  );
});

test('RealRegMileageExtractor returns NO_CONVERSATION_DATA when no text is available', async () => {
  const apiClient = new StubJifelineApiClient();
  const openAiClient = new RecordingOpenAiClient();
  const extractor = new RealRegMileageExtractor(
    apiClient as unknown as JifelineApiClient,
    openAiClient
  );

  const result: RegMileageExtractionResult = await extractor.extract({
    ticketId: 'ticket-4',
    ticketNumber: 101,
  });

  assert.equal(result.vehicleRegistration, null);
  assert.equal(result.vehicleMileage, null);
  assert.equal(result.registrationConfidence, 0);
  assert.equal(result.mileageConfidence, 0);
  assert.ok(
    result.errors.some((error) => error.code === 'NO_CONVERSATION_DATA')
  );
});

test('RealRegMileageExtractor throws RegMileageSystemError when OpenAI client throws', async () => {
  const apiClient = new StubJifelineApiClient();

  const failingOpenAiClient: OpenAiExtractionClient = {
    // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars
    async extractRegAndMileage(_params): Promise<OpenAiExtractionResponse> {
      throw new Error('OpenAI failure');
    },
  };

  const extractor = new RealRegMileageExtractor(
    apiClient as unknown as JifelineApiClient,
    failingOpenAiClient
  );

  const conversation =
    'Reg AB12 CDE, mileage maybe 10,000 miles or 20,000 miles, not sure.';

  await assert.rejects(
    () =>
      extractor.extract({
        ticketId: 'ticket-5',
        ticketNumber: 202,
        conversationText: conversation,
      }),
    RegMileageSystemError
  );
});


