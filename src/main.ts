import './styles.css';
import { AppController } from './app/AppController';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Application root is missing');

new AppController(root).start();
