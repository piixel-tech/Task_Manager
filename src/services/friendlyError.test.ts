import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { friendlyMessage, friendlyValidation } from './friendlyError';
import { getErrorMessage } from './api';

const axiosError = (status: number | null, detail?: unknown) => {
  const err = new AxiosError('Request failed with status code ' + status);
  if (status !== null) err.response = { status, data: { detail }, statusText: '', headers: {}, config: {} as never };
  return err;
};

describe('friendly server messages', () => {
  it('says the network is down when there is no answer at all', () => {
    expect(getErrorMessage(axiosError(null))).toBe('We can’t reach the server. Check your connection and try again.');
  });

  it('keeps the API’s own sentences', () => {
    expect(getErrorMessage(axiosError(409, 'Only a pending request can be cancelled'))).toBe('Only a pending request can be cancelled');
    expect(getErrorMessage(axiosError(403, { code: 'x', message: 'Connect Google in Settings first.' }))).toBe('Connect Google in Settings first.');
  });

  it('rewrites the terse framework wording', () => {
    expect(getErrorMessage(axiosError(403, 'Insufficient permissions'))).toBe('You don’t have permission to do that.');
    expect(getErrorMessage(axiosError(401, 'Not authenticated'))).toBe('Your session has ended. Please sign in again.');
    expect(getErrorMessage(axiosError(401, 'Could not validate credentials'))).toBe('Your session has ended. Please sign in again.');
    expect(getErrorMessage(axiosError(404, 'Not Found'))).toBe('We couldn’t find that. It may have been removed.');
  });

  it('never shows technical text', () => {
    expect(getErrorMessage(axiosError(500, 'Traceback (most recent call last): KeyError'))).toBe('Something went wrong on our side. Please try again in a moment.');
    expect(getErrorMessage(axiosError(400, 'E11000 duplicate key error collection: users index: email_1'))).toBe('Something went wrong');
    expect(getErrorMessage(new Error('Request failed with status code 502'), 'Could not load the page')).toBe('Could not load the page');
    expect(getErrorMessage(new TypeError('Failed to fetch'), 'Could not load the page')).toBe('Could not load the page');
    expect(getErrorMessage(axiosError(500))).toBe('Something went wrong on our side. Please try again in a moment.');
  });

  it('explains by status when the API says nothing', () => {
    expect(getErrorMessage(axiosError(429))).toBe('Too many tries in a row. Wait a moment and try again.');
    expect(getErrorMessage(axiosError(413))).toBe('That file is too large.');
    expect(getErrorMessage(axiosError(418), 'Could not do it')).toBe('Could not do it');
  });

  it('turns validation problems into plain sentences', () => {
    expect(friendlyValidation({ type: 'missing', loc: ['body', 'due_date'], msg: 'Field required' })).toBe('Fill in the due date.');
    expect(friendlyValidation({ type: 'string_too_short', loc: ['body', 'title'], ctx: { min_length: 1 } })).toBe('Enter the title.');
    expect(friendlyValidation({ type: 'string_too_short', loc: ['body', 'password'], ctx: { min_length: 8 } })).toBe('The password needs at least 8 characters.');
    expect(friendlyValidation({ type: 'string_too_long', loc: ['body', 'text'], ctx: { max_length: 500 } })).toBe('The text can be at most 500 characters.');
    expect(friendlyValidation({ type: 'value_error', msg: 'Value error, The end date cannot be before the start date' })).toBe('The end date cannot be before the start date.');
    expect(friendlyValidation({ type: 'int_parsing', loc: ['query', 'limit'] })).toBe('Enter a valid number for the limit.');
    expect(getErrorMessage(axiosError(422, [{ type: 'missing', loc: ['body', 'title'], msg: 'Field required' }]))).toBe('Fill in the title.');
  });

  it('uses the fallback when nothing else is known', () => {
    expect(friendlyMessage({}, 'Could not save')).toBe('Could not save');
    expect(getErrorMessage('what', 'Could not save')).toBe('Could not save');
  });
});
