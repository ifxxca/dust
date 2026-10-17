import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.retailpickup.mobile.dev',
    appName: 'Retail Pickup Dev',
    loggingBehavior: 'none',
    webDir: 'resources/mobile/dist',
    server: { androidScheme: 'https' },
    android: { allowMixedContent: true },
    plugins: { PushNotifications: { presentationOptions: ['alert', 'sound'] } },
};

export default config;
