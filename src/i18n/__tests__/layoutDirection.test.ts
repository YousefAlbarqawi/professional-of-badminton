/**
 * The cold-start direction repair. BUILD-SPEC 16.1.
 *
 * `I18nManager.forceRTL()` only takes effect on the next launch, so a fresh
 * install — Arabic by default — would otherwise run its whole first session
 * left to right. These tests hold the repair and, just as importantly, the
 * guard that stops it relaunching forever when `forceRTL` never persists.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';

import { DIRECTION_RELOAD_STORAGE_KEY, alignLayoutDirection } from '..';
import { restart } from '../restart';

jest.mock('../restart', () => ({
  restart: jest.fn(async (): Promise<void> => undefined),
}));

const restartMock = restart as jest.MockedFunction<typeof restart>;

/** The native flag, which is a constant on the real module. */
function setNativeDirection(isRTL: boolean): void {
  Object.defineProperty(I18nManager, 'isRTL', {
    value: isRTL,
    configurable: true,
    writable: true,
  });
}

describe('alignLayoutDirection', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    restartMock.mockResolvedValue(undefined);
    jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => undefined);
    jest.spyOn(I18nManager, 'allowRTL').mockImplementation(() => undefined);
    await AsyncStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('reloads once when a fresh install resolves to Arabic in a left-to-right layout', async () => {
    setNativeDirection(false);

    await expect(alignLayoutDirection('ar')).resolves.toBe(true);

    expect(I18nManager.allowRTL).toHaveBeenCalledWith(true);
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
    expect(restartMock).toHaveBeenCalledTimes(1);
    await expect(AsyncStorage.getItem(DIRECTION_RELOAD_STORAGE_KEY)).resolves.toBe('true');
  });

  it('does nothing when the direction already agrees', async () => {
    setNativeDirection(true);

    await expect(alignLayoutDirection('ar')).resolves.toBe(false);

    expect(I18nManager.forceRTL).not.toHaveBeenCalled();
    expect(restartMock).not.toHaveBeenCalled();
  });

  it('does nothing for an English install already left to right', async () => {
    setNativeDirection(false);

    await expect(alignLayoutDirection('en')).resolves.toBe(false);

    expect(I18nManager.forceRTL).not.toHaveBeenCalled();
    expect(restartMock).not.toHaveBeenCalled();
  });

  it('clears the guard once the direction has taken, so a later switch can reload', async () => {
    await AsyncStorage.setItem(DIRECTION_RELOAD_STORAGE_KEY, 'true');
    setNativeDirection(true);

    await expect(alignLayoutDirection('ar')).resolves.toBe(false);

    await expect(AsyncStorage.getItem(DIRECTION_RELOAD_STORAGE_KEY)).resolves.toBeNull();
  });

  it('does not reload a second time when forceRTL did not persist', async () => {
    await AsyncStorage.setItem(DIRECTION_RELOAD_STORAGE_KEY, 'true');
    setNativeDirection(false);

    await expect(alignLayoutDirection('ar')).resolves.toBe(false);

    // The flag is still set for the next launch; only the relaunch is skipped.
    expect(I18nManager.forceRTL).toHaveBeenCalledWith(true);
    expect(restartMock).not.toHaveBeenCalled();
  });

  it('still reloads for the opposite direction after a failed attempt', async () => {
    await AsyncStorage.setItem(DIRECTION_RELOAD_STORAGE_KEY, 'true');
    setNativeDirection(true);

    await expect(alignLayoutDirection('en')).resolves.toBe(true);

    expect(I18nManager.forceRTL).toHaveBeenCalledWith(false);
    expect(restartMock).toHaveBeenCalledTimes(1);
    await expect(AsyncStorage.getItem(DIRECTION_RELOAD_STORAGE_KEY)).resolves.toBe('false');
  });

  it('gives up the reload when the guard cannot be read', async () => {
    setNativeDirection(false);
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(alignLayoutDirection('ar')).resolves.toBe(false);

    expect(restartMock).not.toHaveBeenCalled();
  });

  it('gives up the reload when the guard cannot be written', async () => {
    setNativeDirection(false);
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage full'));

    await expect(alignLayoutDirection('ar')).resolves.toBe(false);

    expect(restartMock).not.toHaveBeenCalled();
  });

  it('starts the app anyway when the reload itself fails', async () => {
    setNativeDirection(false);
    restartMock.mockRejectedValueOnce(new Error('restart_failed'));

    await expect(alignLayoutDirection('ar')).resolves.toBe(false);
  });

  it('starts the app anyway when clearing the guard fails', async () => {
    setNativeDirection(true);
    jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('storage unavailable'));

    await expect(alignLayoutDirection('ar')).resolves.toBe(false);
  });
});
