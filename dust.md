# NebulaGraph 星尘设计规范

## 1. 设计目标

星尘不是装饰背景，而是关系图空间层次的一部分。

它的作用是：

* 增强深空感
* 衬托节点发光
* 暗示关系网络密度
* 增强画面的纵深
* 避免纯黑背景显得单薄
* 让关系图像真实星云一样自然扩散

最终视觉目标：

> 关系图像漂浮在深空星云中，节点像恒星，连线像星际航道，星尘自然聚集在节点群、强关系路径和高密度关系区域附近。

不要做成：

* 普通星空壁纸
* 均匀撒点背景
* 赛博朋克粒子背景
* 过度闪烁的游戏特效
* 干扰业务关系图阅读的动态背景

---

# 2. 星尘分层

星尘必须分层绘制，至少包含 5 层。

推荐绘制顺序：

1. Deep Space Noise Layer
2. Background Dust Layer
3. Nebula Cloud Layer
4. Network Dust Layer
5. Hub Halo Dust Layer

---

# 3. Deep Space Noise Layer

## 作用

制造深空底色，避免背景是死黑色。

## 实现方式

使用 Canvas 生成细微噪点，或使用 CSS radial-gradient + noise texture。

## 参数

```ts
const deepSpaceNoise = {
  opacity: 0.025,
  particleSize: [0.4, 0.8],
  density: 0.0008,
  colorPalette: [
    "rgba(255,255,255,0.04)",
    "rgba(180,210,255,0.035)",
    "rgba(120,160,220,0.025)"
  ],
  blur: 0,
  movement: false
};
```

## 要求

* 分布可以接近随机
* 透明度必须非常低
* 不参与交互
* 不要明显看到颗粒边界
* 不能喧宾夺主

---

# 4. Background Dust Layer

## 作用

提供远处星尘，形成宇宙空间感。

## 参数

```ts
const backgroundDust = {
  count: 1200,
  sizeRange: [0.6, 1.6],
  opacityRange: [0.04, 0.12],
  blurRange: [0, 1.5],
  colorPalette: [
    "rgba(255,255,255,1)",
    "rgba(220,235,255,1)",
    "rgba(190,235,255,1)",
    "rgba(210,195,255,1)"
  ],
  twinkle: {
    enabled: true,
    speedRange: [0.0004, 0.0012],
    amplitudeRange: [0.08, 0.18]
  }
};
```

## 分布规则

不要完全均匀分布。

建议使用：

* 70% 随机分布
* 20% 向画布中心弱聚集
* 10% 形成极淡的斜向星带

示例逻辑：

```ts
function generateBackgroundDust(width: number, height: number, count: number) {
  return Array.from({ length: count }, () => {
    const mode = Math.random();

    if (mode < 0.7) {
      return randomPoint(width, height);
    }

    if (mode < 0.9) {
      return biasedPointToCenter(width, height, 0.18);
    }

    return pointOnSoftGalaxyBand(width, height);
  });
}
```

## 要求

* 星点不能太密
* 不要出现规则网格感
* 不要所有星点一样亮
* 不要使用纯白大点
* 闪烁必须非常轻微

---

# 5. Nebula Cloud Layer

## 作用

制造星云雾气和色彩深度。

这一层不是点，而是大面积低透明度模糊光斑。

## 参数

```ts
const nebulaClouds = {
  count: 6,
  radiusRange: [180, 520],
  opacityRange: [0.035, 0.11],
  blurRange: [80, 180],
  colorPalette: [
    "rgba(80, 180, 255, 1)",
    "rgba(120, 100, 255, 1)",
    "rgba(80, 255, 220, 1)",
    "rgba(255, 120, 170, 1)",
    "rgba(255, 210, 120, 1)"
  ],
  blendMode: "screen"
};
```

## 推荐位置

星云云团不要均匀放置。

推荐：

* 一个主云团靠近关系图核心
* 两三个云团靠近关系密集区域
* 一两个云团放在边缘，制造空间延展

## 要求

* 色彩透明度要低
* 边缘必须柔和
* 不能变成彩色背景块
* 不要覆盖节点文本
* 不要高饱和霓虹感

---

# 6. Network Dust Layer

## 作用

这是最重要的一层。

星尘应当沿着关系网络自然聚集，让用户感觉关系越密集的区域，空间中的星尘越多。

## 生成规则

不要全画布随机撒点。

星尘来源应该是关系边 link。

每条关系边根据强度生成一定数量星尘：

```ts
const networkDust = {
  baseParticlesPerLink: 2,
  strengthMultiplier: 5,
  sizeRange: [0.7, 2.4],
  opacityRange: [0.06, 0.22],
  blurRange: [1, 5],
  offsetRange: [8, 36],
  colorInheritFromLink: true,
  movement: {
    enabled: true,
    speedRange: [0.02, 0.08],
    direction: "along-link",
    loop: true
  }
};
```

## 伪代码

```ts
function generateNetworkDust(links: GraphLink[], nodesById: Map<string, GraphNode>) {
  const particles: DustParticle[] = [];

  for (const link of links) {
    const source = nodesById.get(link.source);
    const target = nodesById.get(link.target);

    if (!source || !target) continue;

    const strength = link.strength ?? 1;
    const count = Math.floor(2 + strength * 5);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const x = lerp(source.x, target.x, t);
      const y = lerp(source.y, target.y, t);

      const normal = getNormalVector(source, target);
      const offset = randomGaussian(0, 18 + strength * 4);

      particles.push({
        x: x + normal.x * offset,
        y: y + normal.y * offset,
        size: random(0.7, 2.4),
        opacity: random(0.06, 0.22),
        blur: random(1, 5),
        color: getDustColorByRelation(link.relation),
        speed: random(0.02, 0.08),
        phase: Math.random() * Math.PI * 2,
        linkId: link.id
      });
    }
  }

  return particles;
}
```

## 颜色规则

星尘颜色可以继承关系线颜色，但透明度要更低。

```ts
const relationDustColors = {
  default: "rgba(180, 220, 255, 0.16)",
  strong: "rgba(255, 220, 150, 0.18)",
  risk: "rgba(255, 100, 120, 0.18)",
  control: "rgba(255, 190, 90, 0.18)",
  guarantee: "rgba(170, 130, 255, 0.16)",
  investment: "rgba(90, 230, 210, 0.16)"
};
```

## 要求

* 关系强的路径星尘更多
* 关系弱的路径星尘更少
* 星尘应该围绕线段轻微扩散
* 不能刚好压在线条上
* 不能像铁路轨道一样规则排列
* 运动方向可以沿关系线缓慢漂移
* 动画速度必须很慢

---

# 7. Hub Halo Dust Layer

## 作用

突出核心节点、重要节点和高连接度节点。

这些节点周围应出现星尘光晕，像恒星周围的尘埃盘。

## 参数

```ts
const hubHaloDust = {
  enabled: true,
  minDegree: 5,
  particlesPerHub: [20, 80],
  radiusRange: [32, 140],
  sizeRange: [0.8, 3.2],
  opacityRange: [0.08, 0.28],
  blurRange: [2, 8],
  orbit: {
    enabled: true,
    speedRange: [0.0008, 0.003],
    eccentricityRange: [0.65, 1.2]
  }
};
```

## 生成规则

节点连接数越多，星尘越多。

```ts
function getHubDustCount(node: GraphNode) {
  const degree = node.degree ?? 0;
  return clamp(20 + degree * 4, 20, 80);
}
```

半径根据节点重要性计算：

```ts
function getHubDustRadius(node: GraphNode) {
  const value = node.value ?? 1;
  return clamp(32 + value * 3, 32, 140);
}
```

## 要求

* 核心节点周围星尘最多
* 普通节点不要产生明显光晕
* 光晕不能遮挡节点文字
* 星尘轨迹不能太明显
* 不要做成规则圆环
* 分布应呈椭圆、不规则云团或偏心环

---

# 8. 聚焦状态下的星尘变化

当用户 hover 或 click 某个节点时，星尘应该辅助表达关系焦点。

## Hover 节点

```ts
const hoverDustState = {
  relatedNetworkDustOpacity: 1.0,
  unrelatedNetworkDustOpacity: 0.12,
  relatedDustBrightness: 1.4,
  unrelatedDustBrightness: 0.5,
  hubHaloBoost: 1.6
};
```

规则：

* 当前节点周围星尘增强
* 一度关系路径上的星尘增强
* 非相关星尘降低透明度
* 背景星尘基本不变

## Focus 节点

```ts
const focusDustState = {
  focusedHubDustOpacity: 1.0,
  firstDegreeDustOpacity: 0.85,
  secondDegreeDustOpacity: 0.35,
  unrelatedNetworkDustOpacity: 0.05,
  backgroundDustOpacity: 0.5
};
```

规则：

* 当前节点周围尘埃盘最亮
* 一度关系路径星尘明显可见
* 二度关系路径弱化
* 其他路径星尘几乎隐藏
* 背景星尘降低，避免干扰分析

---

# 9. 性能设计

星尘数量必须受控。

## 推荐数量上限

```ts
const dustPerformanceBudget = {
  backgroundDustMax: 1800,
  networkDustMax: 6000,
  hubDustMax: 2500,
  totalDustMax: 9000
};
```

## 大图降级策略

当节点数超过 1000：

```ts
const largeGraphDustPolicy = {
  backgroundDust: 800,
  networkDustSamplingRate: 0.35,
  hubDustOnlyForTopN: 50,
  disableTinyTwinkle: true,
  disableOrbitAnimation: true
};
```

当节点数超过 5000：

```ts
const hugeGraphDustPolicy = {
  backgroundDust: 400,
  networkDustSamplingRate: 0.12,
  hubDustOnlyForTopN: 20,
  renderDustToOffscreenCanvas: true,
  redrawStaticDustOnlyOnZoomEnd: true,
  disableAllDustAnimation: true
};
```

## 渲染建议

* 使用 Canvas，不要用 DOM 渲染星尘
* 背景星尘绘制到离屏 Canvas
* 只有 Network Dust 和 Hub Dust 参与轻微动画
* requestAnimationFrame 中避免重新生成粒子
* 粒子坐标生成后缓存
* 缩放时按 transform 绘制，不要重新计算所有粒子
* 大图下关闭 twinkle 和 orbit

---

# 10. 星尘绘制顺序

Canvas 绘制顺序必须固定：

```ts
drawBackgroundGradient(ctx);
drawDeepSpaceNoise(ctx);
drawBackgroundDust(ctx);
drawNebulaClouds(ctx);
drawNetworkDust(ctx);
drawLinks(ctx);
drawHubHaloDust(ctx);
drawNodes(ctx);
drawLabels(ctx);
drawInteractionHighlights(ctx);
```

注意：

* Network Dust 应该在 links 下面
* Hub Halo Dust 应该在 nodes 下面
* Labels 必须永远在最上层
* Focus 高亮可以最后单独绘制

---

# 11. 颜色规范

## 基础星尘

```ts
const cosmicDustPalette = {
  white: "rgba(255,255,255,0.12)",
  iceBlue: "rgba(190,235,255,0.14)",
  paleCyan: "rgba(160,255,240,0.12)",
  paleViolet: "rgba(210,195,255,0.12)",
  warmGold: "rgba(255,220,150,0.12)",
  rose: "rgba(255,150,170,0.10)"
};
```

## 背景星尘

```ts
const backgroundDustPalette = [
  "rgba(255,255,255,0.08)",
  "rgba(220,235,255,0.07)",
  "rgba(190,235,255,0.06)",
  "rgba(210,195,255,0.055)"
];
```

## 网络星尘

```ts
const networkDustPalette = {
  default: "rgba(180,220,255,0.16)",
  strong: "rgba(255,220,150,0.18)",
  control: "rgba(255,180,100,0.18)",
  risk: "rgba(255,90,110,0.20)",
  guarantee: "rgba(170,130,255,0.16)",
  investment: "rgba(90,230,210,0.16)"
};
```

---

# 12. 动画规范

## 背景星尘

只允许轻微闪烁：

```ts
opacity = baseOpacity * (1 + Math.sin(time * speed + phase) * amplitude);
```

参数：

```ts
speed: 0.0004 ~ 0.0012
amplitude: 0.08 ~ 0.18
```

## 网络星尘

允许沿边慢速漂移：

```ts
particle.t = (particle.t + particle.speed * deltaTime) % 1;
```

速度：

```ts
0.02 ~ 0.08 px/frame
```

## Hub 星尘

允许极慢速偏心环绕：

```ts
angle += orbitSpeed;
x = node.x + Math.cos(angle) * radiusX;
y = node.y + Math.sin(angle) * radiusY;
```

速度：

```ts
0.0008 ~ 0.003 radians/frame
```

## 禁止

* 快速闪烁
* 大面积呼吸动画
* 大量粒子高速移动
* 粒子尾迹过长
* 类似流星雨的效果
* 类似屏保的旋转星空

---

# 13. 缩放规则

星尘在不同缩放级别下应自动调整可见度。

```ts
function getDustOpacityByZoom(zoom: number) {
  if (zoom < 0.4) return 0.45;
  if (zoom < 0.8) return 0.75;
  if (zoom < 2.0) return 1.0;
  return 0.65;
}
```

规则：

* 远距离缩放时，减少细小星尘，防止糊成一片
* 正常视图时，完整显示星尘
* 近距离放大时，降低背景星尘，只保留关系路径星尘
* 标签出现时，星尘透明度要降低，保证文字可读

---

# 14. 交互规则

## Hover 节点

* 当前节点周围 Hub Dust 增强
* 当前节点相关 Network Dust 增强
* 非相关 Network Dust 降低至 12%
* Background Dust 不受影响或降低至 80%

## Click 节点

* 当前节点 Hub Dust 增强至 180%
* 一度关系 Network Dust 保持 100%
* 二度关系 Network Dust 保持 35%
* 非相关 Network Dust 降低至 5%
* 背景星尘降低至 50%

## Clear Focus

* 所有星尘状态平滑恢复
* 过渡时间 300~600ms

---

# 15. 可配置主题对象

请在项目中定义一个统一的主题配置：

```ts
export const cosmicDustTheme = {
  background: {
    base: "#05070D",
    radialCenter: "#0B1020",
    radialEdge: "#03050A"
  },

  deepSpaceNoise: {
    opacity: 0.025,
    density: 0.0008,
    sizeRange: [0.4, 0.8]
  },

  backgroundDust: {
    count: 1200,
    sizeRange: [0.6, 1.6],
    opacityRange: [0.04, 0.12],
    blurRange: [0, 1.5],
    colors: [
      "rgba(255,255,255,1)",
      "rgba(220,235,255,1)",
      "rgba(190,235,255,1)",
      "rgba(210,195,255,1)"
    ],
    twinkle: {
      enabled: true,
      speedRange: [0.0004, 0.0012],
      amplitudeRange: [0.08, 0.18]
    }
  },

  nebulaClouds: {
    count: 6,
    radiusRange: [180, 520],
    opacityRange: [0.035, 0.11],
    blurRange: [80, 180],
    colors: [
      "rgba(80,180,255,1)",
      "rgba(120,100,255,1)",
      "rgba(80,255,220,1)",
      "rgba(255,120,170,1)",
      "rgba(255,210,120,1)"
    ]
  },

  networkDust: {
    baseParticlesPerLink: 2,
    strengthMultiplier: 5,
    maxParticles: 6000,
    sizeRange: [0.7, 2.4],
    opacityRange: [0.06, 0.22],
    blurRange: [1, 5],
    offsetRange: [8, 36],
    movement: {
      enabled: true,
      speedRange: [0.02, 0.08]
    }
  },

  hubHaloDust: {
    enabled: true,
    minDegree: 5,
    particlesPerHubRange: [20, 80],
    radiusRange: [32, 140],
    sizeRange: [0.8, 3.2],
    opacityRange: [0.08, 0.28],
    blurRange: [2, 8],
    orbit: {
      enabled: true,
      speedRange: [0.0008, 0.003],
      eccentricityRange: [0.65, 1.2]
    }
  },

  interaction: {
    hover: {
      relatedNetworkDustOpacity: 1.0,
      unrelatedNetworkDustOpacity: 0.12,
      relatedDustBrightness: 1.4,
      unrelatedDustBrightness: 0.5,
      hubHaloBoost: 1.6
    },
    focus: {
      focusedHubDustOpacity: 1.0,
      firstDegreeDustOpacity: 0.85,
      secondDegreeDustOpacity: 0.35,
      unrelatedNetworkDustOpacity: 0.05,
      backgroundDustOpacity: 0.5
    },
    transitionMs: 450
  },

  performance: {
    backgroundDustMax: 1800,
    networkDustMax: 6000,
    hubDustMax: 2500,
    totalDustMax: 9000,
    largeGraphThreshold: 1000,
    hugeGraphThreshold: 5000
  }
};
```

---

# 16. Codex 实现要求

请在项目中实现以下文件：

```txt
src/theme/cosmicDustTheme.ts
src/utils/dustGenerator.ts
src/components/GraphCanvas.tsx
src/components/CosmicBackground.tsx
```

## dustGenerator.ts 需要提供

```ts
generateBackgroundDust(width, height, theme)
generateNebulaClouds(width, height, graphBounds, theme)
generateNetworkDust(nodes, links, theme)
generateHubHaloDust(nodes, links, theme)
updateDustAnimation(particles, time, deltaTime)
drawDustParticles(ctx, particles, viewport, interactionState)
```

## CosmicBackground.tsx 负责

* 背景渐变
* Deep Space Noise
* Background Dust
* Nebula Cloud

## GraphCanvas.tsx 负责

* Network Dust
* Hub Halo Dust
* Links
* Nodes
* Labels
* Hover / Focus 状态联动

---

# 17. 最终验收标准

完成后效果应满足：

* 背景有深空层次，而不是纯黑
* 星尘分布自然，不是均匀撒点
* 关系密集区域星尘明显更多
* 核心节点周围有类似恒星尘埃盘的效果
* hover 和 click 时，相关星尘能辅助突出关系路径
* 非相关星尘会明显弱化
* 星尘不影响节点和文字阅读
* 大图模式下性能稳定
* 视觉上接近真实星云摄影，而不是游戏粒子特效