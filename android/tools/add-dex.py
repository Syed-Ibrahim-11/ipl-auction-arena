import sys
import zipfile

apk_path, dex_path = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(apk_path, "a", zipfile.ZIP_DEFLATED) as archive:
    archive.write(dex_path, "classes.dex")
print("dex: classes.dex added to", apk_path)
