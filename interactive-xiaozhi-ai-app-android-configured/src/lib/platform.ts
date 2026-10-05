import { Capacitor } from '@capacitor/core';
import { isDesktop } from './desktop';

export const isNative = Capacitor.isNativePlatform();
export const isAndroid = Capacitor.getPlatform() === 'android';

document.documentElement.dataset.platform = isDesktop ? 'desktop' : Capacitor.getPlatform();