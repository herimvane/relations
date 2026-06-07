# 节点层级设计规范
## 计算每个节点的综合核心分
core_score =
  度中心性 * 0.40
  + 节点权重 * 0.35
  + 加权关系强度 * 0.20
  + 类型优先级 * 0.05

## 然后按 core_score 排名分层

核心节点 = min(max(1, 总节点数 * 1%), 30)
一级重要 = min(总节点数 * 8%, 160)
二级节点 = min(总节点数 * 30%, 800)
三级节点 = 其余
特殊节点 = 风险规则覆盖

## 特殊节点风险规则覆盖
risk_level = high / 高 / 高风险
risk = high / 高风险
status = abnormal / 异常 / 冻结 / 注销 / 吊销
tag = special / risk / abnormal / 黑名单 / 失信 / 涉诉
is_special = true
is_risk = true
is_abnormal = true
blacklist = true
sanctioned = true
lawsuit_count > 0
penalty_count > 0
dishonest = true

# 整体风格

避免：

* 赛博朋克
* 高饱和科技蓝
* 霓虹RGB
* 黑客风

要求：

高级、克制、真实宇宙观感。

---

# 背景

## 主背景

Color: #05070D

RGB:
5,7,13

用于：

Canvas背景

---

## 深空渐变

Center:
#0B1020

Edge:
#03050A

Radial Gradient

用于：

中心区域略亮
边缘逐渐沉入深空

---

## 星尘颜色

Color:
rgba(255,255,255,0.08)

Size:
1~2px

Blur:
2~4px

Density:
1000~3000 particles

---

# 节点颜色

## 核心节点（超新星）

Color:
#FFE8D6

Glow:
#FF7A7A

Outer Glow:
rgba(255,122,122,0.8)

Radius:
12~20px

Blur:
20px

用于：

核心节点

---

## 一级重要节点（恒星）

Color:
#FFF2A8

Glow:
#FFD54F

用于：

重要关联主体

---

## 二级节点（蓝白星）

Color:
#BEEBFF

Glow:
#65D6FF

用于：

普通关联主体

---

## 三级节点（青色星）

Color:
#B8FFF3

Glow:
#45F0D6

用于：

外围关系

---

## 特殊节点（紫色星云）

Color:
#D9C2FF

Glow:
#A675FF

用于：

异常主体
风险主体
特殊标签

---

# 连线颜色

不要纯白。

---

## 默认关系线

Color:
rgba(180,220,255,0.08)

Width:
0.3~0.6

---

## 中等关系

Color:
rgba(140,220,255,0.15)

Width:
0.8~1.2

---

## 强关系

Color:
rgba(255,220,150,0.25)

Width:
1.5~2

---

## 极强关系

Color:
rgba(255,140,140,0.4)

Width:
2~3

---

# Hover状态

节点：

Brightness:
160%

Glow:
300%

Scale:
1.3

---

相关连线：

Opacity:
100%

Width:
+100%

---

一度关系节点：

Opacity:
100%

Brightness:
130%

---

非关联节点：

Opacity:
15%

Saturation:
30%

---

# Focus状态

点击节点后

当前节点：

Color:
#FFFFFF

Glow:
#FFB3B3

Scale:
1.5

Blur:
30px

---

一度关系节点：

Opacity:
100%

---

二度关系节点：

Opacity:
60%

---

其他节点：

Opacity:
8%

---

其他连线：

Opacity:
5%

---

# 文字颜色

## 普通标签

Color:
#DDE5F3

Opacity:
80%

---

## Hover标签

Color:
#FFFFFF

Opacity:
100%

---

## 核心节点标签

Color:
#FFFFFF

Font Weight:
700

Text Shadow:
0 0 10px rgba(255,255,255,0.5)

# 动画

节点呼吸周期：

4~8秒

Scale：

1 → 1.05 → 1

---

发光强度：

80% → 100% → 80%

---

禁止：

快速闪烁
频繁颜色变化
炫光扫描线

目标效果：

类似哈勃望远镜拍摄的星云，而不是科幻游戏UI。
