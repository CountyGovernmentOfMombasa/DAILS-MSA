import { render } from '@testing-library/react';
import App from './App';

test('app mounts without crashing', () => {
  render(<App />);
});
