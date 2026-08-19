import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AppStateProvider, useAppState } from '../../../state/store';
import { ConfigForm } from '../ConfigForm';

const StateWatcher: React.FC = () => {
  const { state } = useAppState();
  return (
    <div>
      <div data-testid="active-license-key">{state.config.licenseKey}</div>
      <div data-testid="license-revision">{state.licenseScopeRevision}</div>
      <div data-testid="folders-status">{state.folders.status}</div>
    </div>
  );
};

const TestHarness: React.FC = () => {
  return (
    <AppStateProvider>
      <ConfigForm />
      <StateWatcher />
    </AppStateProvider>
  );
};

describe('ConfigForm', () => {
  it('renders initial config with disabled read-only API key', () => {
    render(<TestHarness />);

    const licenseInput = screen.getByLabelText('License key') as HTMLInputElement;
    const apiKeyInput = screen.getByLabelText('API key') as HTMLInputElement;

    expect(licenseInput.value).toBe('');
    expect(apiKeyInput.disabled).toBe(true);
    expect(apiKeyInput.value).toBe('ZDksovkGHYUqwK8k9hoDCKHSP2geS6WB');
  });

  it('stages license key locally while typing without committing partial keys', () => {
    render(<TestHarness />);

    const licenseInput = screen.getByLabelText('License key') as HTMLInputElement;

    fireEvent.change(licenseInput, { target: { value: 'part' } });
    expect(licenseInput.value).toBe('part');
    expect(screen.getByTestId('active-license-key').textContent).toBe('');
    expect(screen.getByTestId('license-revision').textContent).toBe('0');

    fireEvent.change(licenseInput, { target: { value: 'partial-key' } });
    expect(licenseInput.value).toBe('partial-key');
    expect(screen.getByTestId('active-license-key').textContent).toBe('');
    expect(screen.getByTestId('license-revision').textContent).toBe('0');
  });

  it('commits staged key on blur', () => {
    render(<TestHarness />);

    const licenseInput = screen.getByLabelText('License key') as HTMLInputElement;

    fireEvent.change(licenseInput, { target: { value: 'complete-key-123' } });
    expect(screen.getByTestId('active-license-key').textContent).toBe('');

    fireEvent.blur(licenseInput);
    expect(screen.getByTestId('active-license-key').textContent).toBe('complete-key-123');
    expect(screen.getByTestId('license-revision').textContent).toBe('1');
    expect(screen.getByTestId('folders-status').textContent).toBe('loading');
  });

  it('commits staged key on Enter key press', () => {
    render(<TestHarness />);

    const licenseInput = screen.getByLabelText('License key') as HTMLInputElement;

    fireEvent.change(licenseInput, { target: { value: 'enter-key-456' } });
    expect(screen.getByTestId('active-license-key').textContent).toBe('');

    fireEvent.keyDown(licenseInput, { key: 'Enter', code: 'Enter' });
    expect(screen.getByTestId('active-license-key').textContent).toBe('enter-key-456');
    expect(screen.getByTestId('license-revision').textContent).toBe('1');
  });

  it('does not re-commit or increment revision when blurred with unchanged value', () => {
    render(<TestHarness />);

    const licenseInput = screen.getByLabelText('License key') as HTMLInputElement;

    // Initial blur without change
    fireEvent.blur(licenseInput);
    expect(screen.getByTestId('license-revision').textContent).toBe('0');

    // Change and commit via Enter
    fireEvent.change(licenseInput, { target: { value: 'key-789' } });
    fireEvent.keyDown(licenseInput, { key: 'Enter', code: 'Enter' });
    expect(screen.getByTestId('license-revision').textContent).toBe('1');

    // Subsequent blur without changes keeps revision at 1
    fireEvent.blur(licenseInput);
    expect(screen.getByTestId('license-revision').textContent).toBe('1');
  });
});
