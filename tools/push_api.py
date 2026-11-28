#!/usr/bin/env python3
"""把本地目录发布到 GitHub：建仓库 / 推一次提交 / 建 Release / 传发行包。

令牌只从环境变量 GH_PAT 读，命令行参数里不出现明文：

    $env:GH_PAT = [Environment]::GetEnvironmentVariable('GH_PAT','User')
    python tools/push_api.py --repo cohort --dir . --tag v1.0.0 ...

需要：标准库即可（urllib），不依赖 requests / git。
"""
import argparse
import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = 'https://api.github.com'
UPLOADS = 'https://uploads.github.com'


def token():
    t = os.environ.get('GH_PAT') or os.environ.get('GITHUB_TOKEN')
    if not t:
        sys.exit('GH_PAT 不在环境变量里：先从 User 作用域读出来再交给本脚本')
    return t.strip()


TOKEN = token()
UA = 'cohort-push'


def call(method, path, payload=None, base=API, timeout=120, raw=None, ctype=None, tries=4):
    url = base + path
    data = None
    headers = {
        'Authorization': 'token ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': UA,
        'X-GitHub-Api-Version': '2022-11-28',
    }
    if raw is not None:
        data = raw
        headers['Content-Type'] = ctype or 'application/octet-stream'
    elif payload is not None:
        data = json.dumps(payload).encode()
        headers['Content-Type'] = 'application/json'
    for attempt in range(1, tries + 1):
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
                return r.status, (json.loads(body) if body and r.headers.get('Content-Type', '').startswith('application/json') else body)
        except urllib.error.HTTPError as e:
            body = e.read().decode('utf-8', 'replace')
            try:
                j = json.loads(body)
            except Exception:
                j = {'message': body[:300]}
            if e.code >= 500 and attempt < tries:
                time.sleep(2 * attempt)
                continue
            return e.code, j
        except (TimeoutError, urllib.error.URLError, OSError) as e:
            if attempt < tries:
                print('  网络不稳，重试 %d/%d：%s' % (attempt, tries - 1, str(e)[:80]))
                time.sleep(2 * attempt)
                continue
            return 0, {'message': 'network: %s' % e}
    return 0, {'message': 'network retries exhausted'}


def ensure_repo(owner, repo, desc, private):
    st, r = call('GET', '/repos/%s/%s' % (owner, repo))
    if st == 200:
        print('仓库已存在：' + r['html_url'])
        return r
    st, r = call('POST', '/user/repos', {
        'name': repo, 'description': desc, 'private': private,
        'has_issues': True, 'has_wiki': True,
        'auto_init': False,
    })
    if st not in (200, 201):
        sys.exit('建仓库失败：%s %s' % (st, r))
    print('已建仓库：' + r['html_url'])
    return r


SKIP_DIRS = {'.git', 'data', 'runtime', 'node_modules', '__pycache__'}
SKIP_FILES = {'Cohort.exe', 'CohortStudent.exe', 'Cohort-安装包.exe', 'CohortStudent-安装包.exe'}


def collect(root, includes):
    out = []
    for inc in includes:
        p = os.path.join(root, inc)
        if os.path.isfile(p):
            out.append(p)
            continue
        for dirpath, dirnames, filenames in os.walk(p):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith('.')]
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if f in SKIP_FILES or f.endswith('.zip') or f.endswith('.log'):
                    continue
                out.append(fp)
    return sorted(set(out))


def rel(root, path):
    return os.path.relpath(path, root).replace('\\', '/')


def seed_if_empty(owner, repo, branch='main'):
    """空仓库不能直接调 git/blobs，先用 contents 接口落一次初始提交。"""
    st, _ = call('GET', '/repos/%s/%s/git/ref/heads/%s' % (owner, repo, branch))
    if st == 200:
        return
    st, r = call('PUT', '/repos/%s/%s/contents/.cohort-init' % (owner, repo), {
        'message': 'chore: init repository',
        'content': base64.b64encode(b'cohort\n').decode(),
        'branch': branch,
    })
    if st not in (200, 201):
        sys.exit('初始化空仓库失败：%s %s' % (st, r))
    print('已初始化空仓库')


def push_tree(owner, repo, root, includes, message, branch='main'):
    files = collect(root, includes)
    print('待上传 %d 个文件' % len(files))
    tree = []
    for i, fp in enumerate(files, 1):
        with open(fp, 'rb') as f:
            b = f.read()
        st, r = call('POST', '/repos/%s/%s/git/blobs' % (owner, repo),
                     {'content': base64.b64encode(b).decode(), 'encoding': 'base64'})
        if st not in (200, 201):
            sys.exit('blob 失败 %s：%s %s' % (rel(root, fp), st, r))
        tree.append({'path': rel(root, fp), 'mode': '100644', 'type': 'blob', 'sha': r['sha']})
        if i % 50 == 0:
            print('  blob %d/%d' % (i, len(files)))
    st, ref = call('GET', '/repos/%s/%s/git/ref/heads/%s' % (owner, repo, branch))
    parent = ref['object']['sha'] if st == 200 else None
    tree_payload = {'tree': tree}
    if parent:
        # 带上 base_tree：只覆盖这次上传的文件，其他目录保持原样
        st2, base = call('GET', '/repos/%s/%s/git/commits/%s' % (owner, repo, parent))
        if st2 == 200 and base.get('tree', {}).get('sha'):
            tree_payload['base_tree'] = base['tree']['sha']
    st, r = call('POST', '/repos/%s/%s/git/trees' % (owner, repo), tree_payload)
    if st not in (200, 201):
        sys.exit('tree 失败：%s %s' % (st, r))
    parents = [parent] if parent else []
    st, r = call('POST', '/repos/%s/%s/git/commits' % (owner, repo),
                 {'message': message, 'tree': r['sha'], 'parents': parents})
    if st not in (200, 201):
        sys.exit('commit 失败：%s %s' % (st, r))
    commit = r['sha']
    if parents:
        st, r = call('PATCH', '/repos/%s/%s/git/refs/heads/%s' % (owner, repo, branch), {'sha': commit, 'force': True})
    else:
        st, r = call('POST', '/repos/%s/%s/git/refs' % (owner, repo), {'ref': 'refs/heads/' + branch, 'sha': commit})
        call('PATCH', '/repos/%s/%s' % (owner, repo), {'default_branch': branch})
    if st not in (200, 201):
        sys.exit('ref 失败：%s %s' % (st, r))
    print('提交完成：' + commit[:10])
    return commit


def ensure_release(owner, repo, tag, name, notes, target='main'):
    st, r = call('GET', '/repos/%s/%s/releases/tags/%s' % (owner, repo, tag))
    if st == 200:
        print('Release 已存在：' + r['html_url'])
        return r
    st, r = call('POST', '/repos/%s/%s/releases' % (owner, repo), {
        'tag_name': tag, 'target_commitish': target, 'name': name,
        'body': notes, 'draft': False, 'prerelease': False,
    })
    if st not in (200, 201):
        sys.exit('建 Release 失败：%s %s' % (st, r))
    print('Release 已建：' + r['html_url'])
    return r


def upload_asset(owner, repo, release_id, path, name=None, timeout=300):
    name = name or os.path.basename(path)
    size = os.path.getsize(path)
    print('上传 %s（%.1f MB）…' % (name, size / 1048576.0))
    with open(path, 'rb') as f:
        data = f.read()
    ctype = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    st, r = call('POST', '/repos/%s/%s/releases/%s/assets?name=%s' % (
        owner, repo, release_id, urllib.parse.quote(name)),
        base=UPLOADS, raw=data, ctype=ctype, timeout=timeout)
    if st not in (200, 201):
        print('  资产上传失败：%s %s' % (st, r))
        return None
    print('  已上传：' + r['browser_download_url'])
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True, help='仓库名')
    ap.add_argument('--dir', default='.', help='本地目录')
    ap.add_argument('--desc', default='Cohort 课堂 AI 助教（MIT）')
    ap.add_argument('--message', default='Cohort: 课堂 AI 助教 + 草纸物理实验室')
    ap.add_argument('--include', nargs='+', required=True, help='要上传的文件/目录（相对 --dir）')
    ap.add_argument('--tag', help='要建 Release 就打标签，如 v1.0.0')
    ap.add_argument('--release-name')
    ap.add_argument('--notes', default='')
    ap.add_argument('--notes-file')
    ap.add_argument('--asset', action='append', default=[], help='发行包本地路径，可多次')
    ap.add_argument('--asset-name', action='append', default=[], help='与 --asset 一一对应的下载文件名')
    ap.add_argument('--private', action='store_true')
    ap.add_argument('--skip-push', action='store_true')
    ap.add_argument('--branch', default='main')
    a = ap.parse_args()

    root = os.path.abspath(a.dir)
    st, me = call('GET', '/user')
    if st != 200:
        sys.exit('令牌无效：%s' % me)
    owner = me['login']
    print('账号：' + owner)

    repo = ensure_repo(owner, a.repo, a.desc, a.private)
    if not a.skip_push:
        seed_if_empty(owner, a.repo, a.branch)
        push_tree(owner, a.repo, root, a.include, a.message, a.branch)
    if a.tag:
        notes = a.notes
        if a.notes_file:
            notes = open(a.notes_file, encoding='utf-8').read()
        rel = ensure_release(owner, a.repo, a.tag, a.release_name or a.tag, notes, a.branch)
        names = list(a.asset_name)
        for i, path in enumerate(a.asset):
            nm = names[i] if i < len(names) else None
            upload_asset(owner, a.repo, rel['id'], path, nm)
    print('完成：https://github.com/%s/%s' % (owner, a.repo))


if __name__ == '__main__':
    main()
