# Render HTML pages for WebPlotDigitizer
# NOTE: This requires Python 3

import sys

from jinja2 import Environment, FileSystemLoader, Template
import gettext
import os
import codecs
import subprocess
from pathlib import Path


def get_build_commit():
    """Resolve the commit this build is rendered from.

    Prefers an explicit env var, then the CI-provided SHA, then the local Git
    HEAD. Returns an empty string if none can be determined, so templates can
    fall back to the SOURCE.txt reference.
    """
    commit = os.environ.get("WPD_BUILD_COMMIT") or os.environ.get("GITHUB_SHA")
    if commit:
        return commit.strip()
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except Exception:
        return ""


BUILD_COMMIT = get_build_commit()
BUILD_COMMIT_SHORT = BUILD_COMMIT[:7]


class WPDTranslation:
    def __init__(self, locale):
        self.language = gettext.translation("messages", "locale/", [locale])
        self.language.install()

    def gettext(self, x):
        return self.language.gettext(x)

    def ugettext(self, x):
        return self.language.gettext(x)

    def ungettext(self, x):
        return self.language.ungettext(x)

env = Environment(loader=FileSystemLoader('templates'), extensions=['jinja2.ext.i18n'])

languages = ["en_US", "zh_CN", "fr_FR", "de_DE", "ru", "ja"]

def renderPage(filename):
    print("Rendering " + filename)
    pageTemplate = env.get_template(filename)
    for lang in languages:
        print(("\tLanguage " + lang))
        translation = WPDTranslation(lang)
        env.install_gettext_translations(translation)
        page = pageTemplate.render(
            build_commit=BUILD_COMMIT, build_commit_short=BUILD_COMMIT_SHORT
        )
        
        filename=Path(filename)
        if lang == "en_US":
            outfile = filename
        else:
            outfile = filename.parent / (filename.stem + "." + lang + ".html")
        with outfile.open('wt', encoding='utf-8') as pageFile:
            pageFile.write(page)

renderPage("dev.html")
renderPage("index.html")
renderPage("offline.html")
renderPage("cloud.html")
