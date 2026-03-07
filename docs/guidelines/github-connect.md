# GitHub 연동

## 이미 GitHub에 빈 저장소를 만든 경우
```bash
cd /Users/hhj/love_Letters
git init
git branch -M main
git remote add origin https://github.com/<YOUR_ID>/<YOUR_REPO>.git
git add .
git commit -m "feat: realtime black-white deathmatch"
git push -u origin main
```

## SSH를 쓰는 경우
```bash
git remote add origin git@github.com:<YOUR_ID>/<YOUR_REPO>.git
```
