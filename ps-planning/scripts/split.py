import sys, re, pathlib
src = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
out = pathlib.Path(sys.argv[2])
s0 = src.index("<style>"); s1 = src.index("</style>")
c0 = src.index("<script>"); c1 = src.rindex("</script>")
assert src.count("<style>") == 1 and src.count("<script>") == 1
css = src[s0+len("<style>"):s1].strip("\n") + "\n"
js = src[c0+len("<script>"):c1].strip("\n") + "\n"
head = src[:s0]; body = src[s1+len("</style>"):c0]; tail = src[c1+len("</script>"):]
V = "10.14.1"
tags = "\n".join([
 f'<script src="https://www.gstatic.com/firebasejs/{V}/firebase-app-compat.js"></script>',
 f'<script src="https://www.gstatic.com/firebasejs/{V}/firebase-auth-compat.js"></script>',
 f'<script src="https://www.gstatic.com/firebasejs/{V}/firebase-firestore-compat.js"></script>',
 '<script src="js/firebase-config.js"></script>',
 '<script src="js/platform.js"></script>',
 '<script src="js/app.js"></script>'])
headx = ('<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n'
 '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
 + head +
 '<link rel="stylesheet" href="css/app.css">\n'
 '<link rel="manifest" href="manifest.webmanifest">\n'
 '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n'
 '<meta name="theme-color" content="#14181F">\n</head>\n<body>')
html = headx + body + tags + "\n" + tail.strip() + "\n</body>\n</html>\n"
(out/"css").mkdir(parents=True, exist_ok=True); (out/"js").mkdir(parents=True, exist_ok=True)
(out/"css/app.css").write_text(css, encoding="utf-8")
(out/"js/app.js").write_text(js, encoding="utf-8")
(out/"index.html").write_text(html, encoding="utf-8")
print(len(src), len(css)+len(js)+len(html))
