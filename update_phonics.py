import re

path = "artifacts/english-learning/src/App.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. 사이드바 메뉴에 "파닉스" 추가
target_nav = 'href="/dashboard" label="오늘의 연습"'
phonics_nav = 'href="/dashboard" label="오늘의 연습" icon={HomeIcon} active={location === "/dashboard"} />\n            <NavItem href="/phonics" label="파닉스" icon={BookOpenIcon} active={location === "/phonics"} />'

if "/phonics" not in content and target_nav in content:
    content = re.sub(r'href="/dashboard" label="오늘의 연습"[^\n]*/>', phonics_nav, content, count=1)

# 2. 라우트에 파닉스 화면 추가
route_code = '''        <Route path="/phonics">
          <div className="w-full h-full min-h-[calc(100vh-4rem)] flex flex-col bg-amber-50 rounded-2xl overflow-hidden shadow-sm">
            <iframe src="/phonics.html" title="파닉스" className="w-full flex-1 border-0 min-h-[850px]" />
          </div>
        </Route>'''

if 'path="/phonics"' not in content:
    if "</Switch>" in content:
        content = content.replace("</Switch>", f"{route_code}\n      </Switch>")
    elif "</main>" in content:
        content = content.replace("</main>", f"{route_code}\n      </main>")

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("SUCCESS")
