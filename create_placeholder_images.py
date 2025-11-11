"""
创建占位符角色图片
运行此脚本可以自动生成所有角色的占位符图片，用于测试
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    has_pil = True
except ImportError:
    has_pil = False
    print("未安装 Pillow 库，尝试使用基础方法创建图片...")

import os

# 角色列表
CHARACTERS = ['公主蓉', '王子栗', '幺幺俊羊羊', '勇者', '星耀犊']
COLOR_VARIANTS = [1, 2, 3]

# 配色方案
COLOR_SCHEMES = {
    1: {'bg': (255, 182, 193), 'text': (139, 0, 0)},      # 粉红色系
    2: {'bg': (173, 216, 230), 'text': (0, 0, 139)},      # 蓝色系
    3: {'bg': (144, 238, 144), 'text': (0, 100, 0)},      # 绿色系
}

def create_placeholder_with_pil():
    """使用 PIL 创建占位符图片"""
    static_dir = os.path.join(os.path.dirname(__file__), 'static')
    
    for character in CHARACTERS:
        for color in COLOR_VARIANTS:
            filename = f'{character}{color}.png'
            filepath = os.path.join(static_dir, filename)
            
            # 创建图片
            img = Image.new('RGB', (200, 200), color=COLOR_SCHEMES[color]['bg'])
            draw = ImageDraw.Draw(img)
            
            # 尝试使用字体
            try:
                # Windows 中文字体
                font = ImageFont.truetype('msyh.ttc', 24)
                font_small = ImageFont.truetype('msyh.ttc', 16)
            except:
                font = ImageFont.load_default()
                font_small = ImageFont.load_default()
            
            # 绘制文字
            text1 = character
            text2 = f'配色 {color}'
            
            # 获取文本大小并居中
            bbox1 = draw.textbbox((0, 0), text1, font=font)
            bbox2 = draw.textbbox((0, 0), text2, font=font_small)
            
            text_width1 = bbox1[2] - bbox1[0]
            text_width2 = bbox2[2] - bbox2[0]
            
            x1 = (200 - text_width1) // 2
            y1 = 70
            x2 = (200 - text_width2) // 2
            y2 = 110
            
            draw.text((x1, y1), text1, fill=COLOR_SCHEMES[color]['text'], font=font)
            draw.text((x2, y2), text2, fill=COLOR_SCHEMES[color]['text'], font=font_small)
            
            # 保存图片
            img.save(filepath)
            print(f'已创建: {filename}')

def create_placeholder_simple():
    """创建简单的占位符图片（不依赖PIL）"""
    print("\n提示：未安装 Pillow 库，无法自动创建图片。")
    print("请手动创建以下图片文件（PNG格式），或运行：pip install Pillow\n")
    
    static_dir = os.path.join(os.path.dirname(__file__), 'static')
    print(f"图片应放置在：{static_dir}\n")
    print("需要的图片文件：")
    
    for character in CHARACTERS:
        for color in COLOR_VARIANTS:
            filename = f'{character}{color}.png'
            print(f'  - {filename}')

if __name__ == '__main__':
    print("=" * 50)
    print("创建角色占位符图片")
    print("=" * 50)
    
    if has_pil:
        create_placeholder_with_pil()
        print(f"\n✓ 成功创建 {len(CHARACTERS) * len(COLOR_VARIANTS)} 个占位符图片！")
        print("这些是临时占位符图片，您可以替换为实际的角色图片。")
    else:
        create_placeholder_simple()
        print("\n运行 'pip install Pillow' 来安装图片处理库。")


