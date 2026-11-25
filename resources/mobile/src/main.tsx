import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import MobileApp from './app';
import './styles.css';
import { isBrowserPwa } from './platform';
import { primeScanAudio } from '@/lib/scan-feedback';
import { browserHasDrafts } from './browser-local';

if (isBrowserPwa) {
    document.body.classList.add('retail-pwa');
    document.addEventListener('pointerdown', primeScanAudio, { once: true });
    document.addEventListener('keydown', primeScanAudio, { once: true });
    window.addEventListener('beforeunload', (event) => {
        if (browserHasDrafts()) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <MobileApp />
    </StrictMode>,
);
