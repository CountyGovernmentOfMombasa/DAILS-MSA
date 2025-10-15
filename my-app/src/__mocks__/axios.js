// Simple axios mock for Jest to avoid ESM transform issues in CRA without customization.
const axiosMock = {
  get: jest.fn(() => Promise.resolve({ data: {} })),
  post: jest.fn(() => Promise.resolve({ data: {} })),
  put: jest.fn(() => Promise.resolve({ data: {} })),
  delete: jest.fn(() => Promise.resolve({ data: {} })),
  interceptors: { response: { use: jest.fn() } }
};
export default axiosMock;
export const get = axiosMock.get;
export const post = axiosMock.post;
export const put = axiosMock.put;
export const del = axiosMock.delete;