# Renderer font sources

The renderer distributes the unmodified font files listed below. Runtime code
refers to the stable local filename and `fontKey`; SHA-256 is the release pin
used to detect accidental replacement.

| fontKey | Local file | Official source | Source revision | SHA-256 | License |
| --- | --- | --- | --- | --- | --- |
| `marker` | `LXGWMarkerGothic-Regular.ttf` | https://github.com/lxgw/LxgwWenKai | Existing project asset; file hash is the pin | `9a1e46379442856b9fc64de1d9bd4120903780990e28d99fd6415cadee78a47d` | SIL OFL 1.1; see `OFL-LXGWMarkerGothic.txt` |
| `playful` | `SmileySans-Oblique.ttf` | https://github.com/atelier-anchor/smiley-sans | tag `v2.0.1`, commit `67e3821f4b06cbd7155fa6fa69daff4b6f311b76` | `b447d7e781f08bc95c4c9f23ba71ed2b8ebb639aa7184485c71c4ca5afcd25c4` | SIL OFL 1.1; reserved names remain unchanged; see `OFL-SmileySans.txt` |
| `headline` | `MaShanZheng-Regular.ttf` | https://github.com/googlefonts/mashanzheng | commit `72c50ec001cea63d223d35562eeb2ba42f0fe67a` | `6d2546bb189c732a8ca29af9e22457b152387d158aa459e4ac2ce1e51788b7fb` | SIL OFL 1.1; see `OFL-MaShanZheng.txt` |

These files live under `miniprogram/cloudhosting/`, which is excluded from the
WeChat mini-program main package by the repository preflight.
