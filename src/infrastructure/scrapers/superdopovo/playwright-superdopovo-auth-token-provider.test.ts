import type { Browser, Page } from 'playwright';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaywrightSuperDoPovoAuthTokenProvider } from './playwright-superdopovo-auth-token-provider';

const playwrightMocks = vi.hoisted(() => ({
  launch: vi.fn<() => Promise<Browser>>(),
}));

vi.mock('playwright', () => ({
  chromium: {
    launch: playwrightMocks.launch,
  },
}));

describe('PlaywrightSuperDoPovoAuthTokenProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('captures the bearer token from an api request and caches it', async () => {
    const request = createRequest('Bearer token');
    const waitForRequest = vi.fn(
      (
        predicate: (candidateRequest: RequestLike) => boolean,
        options: { readonly timeout: number },
      ): Promise<RequestLike> => {
        expect(predicate(request)).toBe(true);
        expect(options).toEqual({ timeout: 30000 });

        return Promise.resolve(request);
      },
    );
    const goto = vi.fn(() => Promise.resolve(null));
    const close = vi.fn(() => Promise.resolve());
    const browser = createBrowser({
      close,
      page: createPage({
        goto,
        waitForRequest,
      }),
    });
    playwrightMocks.launch.mockResolvedValue(browser);

    const provider = new PlaywrightSuperDoPovoAuthTokenProvider({
      bootstrapUrl: 'https://loja.superdopovo.com.br',
      timeoutMs: 30000,
    });

    await expect(provider.getAuthorizationHeader()).resolves.toBe('Bearer token');
    await expect(provider.getAuthorizationHeader()).resolves.toBe('Bearer token');

    expect(playwrightMocks.launch).toHaveBeenCalledTimes(1);
    expect(playwrightMocks.launch).toHaveBeenCalledWith({ headless: true });
    expect(goto).toHaveBeenCalledTimes(1);
    expect(goto).toHaveBeenCalledWith('https://loja.superdopovo.com.br', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes the browser when the authorization header is missing', async () => {
    const request = createRequest(undefined);
    const close = vi.fn(() => Promise.resolve());
    const browser = createBrowser({
      close,
      page: createPage({
        goto: vi.fn(() => Promise.resolve(null)),
        waitForRequest: vi.fn(() => Promise.resolve(request)),
      }),
    });
    playwrightMocks.launch.mockResolvedValue(browser);
    const provider = new PlaywrightSuperDoPovoAuthTokenProvider({
      bootstrapUrl: 'https://loja.superdopovo.com.br',
      timeoutMs: 30000,
    });

    await expect(provider.getAuthorizationHeader()).rejects.toThrow(
      'Super do Povo authorization header was not captured.',
    );
    expect(close).toHaveBeenCalledTimes(1);
  });
});

interface RequestLike {
  headers(): Record<string, string | undefined>;
  url(): string;
}

function createRequest(authorizationHeader: string | undefined): RequestLike {
  return {
    headers: () => ({
      authorization: authorizationHeader,
    }),
    url: () => 'https://loja.superdopovo.com.br/api/v1/shops/addresses',
  };
}

function createPage(args: {
  readonly goto: (
    url: string,
    options: { readonly timeout: number; readonly waitUntil: string },
  ) => Promise<null>;
  readonly waitForRequest: (
    predicate: (request: RequestLike) => boolean,
    options: { readonly timeout: number },
  ) => Promise<RequestLike>;
}): Page {
  return {
    goto: args.goto,
    waitForRequest: args.waitForRequest,
  } as Page;
}

function createBrowser(args: {
  readonly close: () => Promise<void>;
  readonly page: Page;
}): Browser {
  return {
    close: args.close,
    newPage: () => Promise.resolve(args.page),
  } as Browser;
}
