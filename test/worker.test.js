import { afterEach, describe, it, expect, vi } from 'vitest';
import yaml from 'js-yaml';
import { createApp } from '../src/app/createApp.jsx';
import { MemoryKVAdapter } from '../src/adapters/kv/memoryKv.js';

const createTestApp = (overrides = {}) => {
    const runtime = {
        kv: overrides.kv ?? new MemoryKVAdapter(),
        assetFetcher: overrides.assetFetcher ?? null,
        logger: console,
        config: {
            configTtlSeconds: 60,
            shortLinkTtlSeconds: null,
            wsllExpClashBaseCacheTtlSeconds: 60,
            ...(overrides.config || {})
        }
    };
    return createApp(runtime);
};

const createTextResponse = (text, { ok = true, status = 200, headers = {} } = {}) => ({
    ok,
    status,
    text: async () => text,
    headers: {
        get: (name) => headers[name.toLowerCase()] ?? null
    }
});

const mockWsllExpBaseFetchFailure = () => vi.stubGlobal('fetch', vi.fn(async () => createTextResponse('', {
    ok: false,
    status: 503
})));

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('Worker', () => {
    it('GET / returns HTML', async () => {
        const app = createTestApp();
        const res = await app.request('http://localhost/');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        const text = await res.text();
        expect(text).toContain('Sublink Worker');
        expect(text).toContain('wsll_exp.ini');
        expect(text).not.toContain('🌐 社交媒体');
        expect(text).not.toContain('🎬 流媒体');
        expect(text).not.toContain('📚 教育资源');
    });

    it('GET /singbox returns JSON', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/json');
        const json = await res.json();
        expect(json).toHaveProperty('outbounds');
    });

    it('GET /singbox ignores a Clash base config ID', async () => {
        const kv = new MemoryKVAdapter();
        await kv.put('clash_test', JSON.stringify({
            'proxy-groups': [{ name: 'Custom', type: 'select', proxies: ['DIRECT'] }]
        }));
        const app = createTestApp({ kv });
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}&configId=clash_test`);

        expect(res.status).toBe(200);
        expect(await res.json()).toHaveProperty('route.rule_set');
    });

    it('GET /singbox returns legacy config for sing-box 1.11 UA', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`, {
            headers: {
                'User-Agent': 'SFI/1.12.2 (Build 2; sing-box 1.11.4; language zh_CN)'
            }
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json?.dns?.servers?.[0]).toHaveProperty('address');
        expect(json?.dns?.servers?.[0]).not.toHaveProperty('type');
        expect(json?.route).not.toHaveProperty('default_domain_resolver');
    });

    it('GET /singbox returns 1.12+ config for sing-box 1.12 UA', async () => {
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/singbox?config=${encodeURIComponent(config)}`, {
            headers: {
                'User-Agent': 'SFA/1.12.12 (587; sing-box 1.12.12; language zh_Hans_CN)'
            }
        });
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json?.dns?.servers?.[0]).toHaveProperty('type');
        expect(json?.dns?.servers?.[0]).not.toHaveProperty('address');
        expect(json?.route).toHaveProperty('default_domain_resolver', 'dns_resolver');
    });

    it('GET /clash returns YAML', async () => {
        mockWsllExpBaseFetchFailure();
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}`);
        expect(res.status).toBe(200);
        // Clash builder returns text/yaml
        expect(res.headers.get('content-type')).toContain('text/yaml');
        const text = await res.text();
        expect(text).toContain('proxies:');
    });

    it('GET /clash defaults to wsll_exp rules, groups, and base config', async () => {
        mockWsllExpBaseFetchFailure();
        const app = createTestApp();
        const config = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#香港节点1';
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}`);
        expect(res.status).toBe(200);
        const parsed = yaml.load(await res.text());

        expect(parsed['mixed-port']).toBe(7890);
        expect(parsed['allow-lan']).toBe(true);
        expect(parsed['rule-providers'].BanAD.url).toBe('https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanAD.list');
        expect(parsed.proxies?.[0]?.udp).toBe(true);
        expect(parsed.rules).toContain('RULE-SET,BanAD,🛑 广告拦截');
        expect(parsed.rules).toContain('DOMAIN-SUFFIX,xn--ngstr-lra8j.com,📢 谷歌🇨🇳Play下载');
        expect(parsed.rules).toContain('GEOIP,CN,🎯 全球直连');
        const nodeSelect = (parsed['proxy-groups'] || []).find(g => g?.name === '🚀 节点选择');
        expect(nodeSelect?.proxies).toEqual([
            '🚀 手动切换',
            '♻️ 自动选择',
            'DIRECT'
        ]);
        const invalidGroups = (parsed['proxy-groups'] || []).filter(group => {
            const hasProxies = Array.isArray(group?.proxies) && group.proxies.length > 0;
            const hasProviders = Array.isArray(group?.use) && group.use.length > 0;
            return !hasProxies && !hasProviders;
        });
        expect(invalidGroups).toEqual([]);
        const removedGroups = new Set(['🇭🇰 香港节点', '🇨🇳 台湾节点', '🇸🇬 狮城节点', '🇯🇵 日本节点', '🇺🇲 美国节点', '🇰🇷 韩国节点', '🎥 奈飞节点']);
        const groupNames = new Set((parsed['proxy-groups'] || []).map(group => group.name));
        for (const removedGroup of removedGroups) {
            expect(groupNames.has(removedGroup)).toBe(false);
        }
        const staleReferences = (parsed['proxy-groups'] || [])
            .flatMap(group => group.proxies || [])
            .filter(member => removedGroups.has(member));
        expect(staleReferences).toEqual([]);
    });

    it('GET /clash fetches and caches the default wsll_exp Clash base config', async () => {
        const fetchMock = vi.fn(async () => createTextResponse('mixed-port: 7999\nallow-lan: false\nproxies: []\nproxy-groups: []\nrules: []\n'));
        vi.stubGlobal('fetch', fetchMock);
        const app = createTestApp({ kv: new MemoryKVAdapter() });
        const config = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#香港节点1';

        const firstRes = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}`);
        const firstParsed = yaml.load(await firstRes.text());
        const secondRes = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}`);
        const secondParsed = yaml.load(await secondRes.text());

        expect(firstRes.status).toBe(200);
        expect(secondRes.status).toBe(200);
        expect(firstParsed['mixed-port']).toBe(7999);
        expect(secondParsed['mixed-port']).toBe(7999);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('GET /clash supports clash_rule_base override URL', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            status: 200,
            text: async () => 'mixed-port: 7999\nallow-lan: false\nproxies: []\nproxy-groups: []\nrules: []\n',
            headers: { get: () => null }
        })));

        const app = createTestApp();
        const config = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#香港节点1';
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}&clash_rule_base=${encodeURIComponent('https://example.com/base.yml')}`);
        expect(res.status).toBe(200);
        const parsed = yaml.load(await res.text());

        expect(parsed['mixed-port']).toBe(7999);
        expect(parsed['allow-lan']).toBe(false);
        expect(parsed.rules).toContain('RULE-SET,BanAD,🛑 广告拦截');
    });

    it('GET /clash supports udp=true query and forces udp for proxies', async () => {
        mockWsllExpBaseFetchFailure();
        const app = createTestApp();
        const config = 'vmess://ew0KICAidiI6ICIyIiwNCiAgInBzIjogInRlc3QiLA0KICAiYWRkIjogIjEuMS4xLjEiLA0KICAicG9ydCI6ICI0NDMiLA0KICAiaWQiOiAiYWRkNjY2NjYtODg4OC04ODg4LTg4ODgtODg4ODg4ODg4ODg4IiwNCiAgImFpZCI6ICIwIiwNCiAgInNjeSI6ICJhdXRvIiwNCiAgIm5ldCI6ICJ3cyIsDQogICJ0eXBlIjogIm5vbmUiLA0KICAiaG9zdCI6ICIiLA0KICAicGF0aCI6ICIvIiwNCiAgInRscyI6ICJ0bHMiDQp9';
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}&udp=true`);
        expect(res.status).toBe(200);
        const text = await res.text();
        const parsed = yaml.load(text);
        expect(parsed?.proxies?.[0]?.udp).toBe(true);
    });

    it('GET /clash supports udp=false query to disable the default UDP override', async () => {
        mockWsllExpBaseFetchFailure();
        const app = createTestApp();
        const config = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#Test';
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}&udp=false`);
        expect(res.status).toBe(200);
        const parsed = yaml.load(await res.text());
        expect(parsed?.proxies?.[0]?.udp).toBe(false);
    });

    it('GET /clash supports group_defaults to set outbound group default option', async () => {
        const app = createTestApp();
        const config = 'ss://YWVzLTEyOC1nY206dGVzdA@example.com:443#HK-Node-1';
        const selectedRules = JSON.stringify(['Apple']);
        const groupDefaults = JSON.stringify({ Apple: 'DIRECT' });
        const res = await app.request(
            `http://localhost/clash?config=${encodeURIComponent(config)}&selectedRules=${encodeURIComponent(selectedRules)}&group_defaults=${encodeURIComponent(groupDefaults)}`
        );
        expect(res.status).toBe(200);
        const text = await res.text();
        const parsed = yaml.load(text);
        const appleGroup = (parsed['proxy-groups'] || []).find(g => g && g.name === '🍏 苹果服务');
        expect(appleGroup).toBeDefined();
        expect(appleGroup.proxies[0]).toBe('DIRECT');
    });

    it('GET /clash rejects empty url-test proxy groups with a diagnostic error', async () => {
        mockWsllExpBaseFetchFailure();
        const app = createTestApp();
        const config = `
proxies:
  - name: Node-A
    type: ss
    server: a.example.com
    port: 443
    cipher: aes-128-gcm
    password: test
proxy-groups:
  - name: Empty Test Group
    type: url-test
    proxies: []
`;
        const res = await app.request(`http://localhost/clash?config=${encodeURIComponent(config)}`);

        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toContain('Invalid proxy group "Empty Test Group"');
        expect(text).toContain('requires at least one proxy or provider reference');
    });

    it('GET /shorten-v2 returns short code', async () => {
        const url = 'http://example.com';
        const kvMock = {
            put: vi.fn(async () => {}),
            get: vi.fn(async () => null),
            delete: vi.fn(async () => {})
        };
        const app = createTestApp({ kv: kvMock });
        const res = await app.request(`http://localhost/shorten-v2?url=${encodeURIComponent(url)}`);
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).toBeTruthy();
        expect(kvMock.put).toHaveBeenCalled();
    });
});
