#!/usr/bin/env python3
"""生成 WePicTool tabBar 图标：home / record / profile，normal(#999) 与 active(#4f6bf5) 两套。
线条风格，81x81 PNG，4x 超采样抗锯齿。"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "miniprogram", "assets", "tabbar")
SIZE = 81
SS = 4  # supersample
W = 5 * SS  # 线宽

NORMAL = (153, 153, 153, 255)   # #999999
ACTIVE = (79, 107, 245, 255)    # #4f6bf5


def canvas():
    img = Image.new("RGBA", (SIZE * SS, SIZE * SS), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def s(v):
    return v * SS


def save(img, name):
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    img.save(os.path.join(OUT, name))
    print("saved", name)


def draw_home(color):
    img, d = canvas()
    # 屋顶
    d.line([(s(18), s(40)), (s(40.5), s(19)), (s(63), s(40))], fill=color, width=W, joint="curve")
    # 屋身（圆角矩形轮廓）
    d.rounded_rectangle([s(23), s(37), s(58), s(65)], radius=s(4), outline=color, width=W)
    # 门（实心小矩形）
    d.rounded_rectangle([s(36.5), s(50), s(44.5), s(65)], radius=s(1.5), fill=color)
    return img


def draw_record(color):
    img, d = canvas()
    # 后层卡（右上偏移，仅轮廓）
    d.rounded_rectangle([s(24), s(15), s(63), s(50)], radius=s(6), outline=color, width=W)
    # 前层卡（左下，盖住后层的边）
    d.rounded_rectangle([s(18), s(31), s(57), s(66)], radius=s(6), fill=(255, 255, 255, 255), outline=color, width=W)
    # 前层卡内一条小横线（示意内容）
    d.line([(s(26), s(44)), (s(40), s(44))], fill=color, width=W)
    return img


def draw_profile(color):
    img, d = canvas()
    # 头
    d.ellipse([s(29), s(17), s(52), s(40)], outline=color, width=W)
    # 肩（椭圆上半弧）
    d.arc([s(19), s(46), s(62), s(86)], start=180, end=360, fill=color, width=W)
    return img


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in [("home", draw_home), ("record", draw_record), ("profile", draw_profile)]:
        save(fn(NORMAL), f"{name}.png")
        save(fn(ACTIVE), f"{name}-active.png")


if __name__ == "__main__":
    main()
