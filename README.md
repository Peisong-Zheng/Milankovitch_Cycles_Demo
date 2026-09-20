# Milankovitch Cycles · 米兰科维奇周期

一个米兰科维奇周期的 3D 可视化演示，面向刚接触天文周期的学生：
深色星空主题的双联 Three.js 场景——左侧可在 "Orbit"（轨道全景）与
"Solstice drift"（夏至漂移教学面板）间切换，右侧可在 "Precession"
（地球整星随岁差摆动）与 "NH summer"（夏至日地距离 + 65°N 日照滚动时序）
之间切换——四个视图从不同角度展示
**偏心率（eccentricity）、地轴倾角（obliquity）、气候岁差（climatic precession）**
三个周期如何改变地球接收阳光的方式，下方配三条随播放同步揭示的时间序列曲线。

纯静态站点，无构建步骤、无后端，three.js 已本地 vendor，离线可用。

## 运行

必须通过 HTTP 服务访问（浏览器禁止 `file://` 页面 fetch 数据文件）。

最简单：在 macOS Finder 中双击 `start.command`
（自动关闭旧服务 → 启动新服务 → 打开浏览器）。

或命令行：

```sh
./serve.sh                # 启动 serve.py（端口 8000，响应禁缓存）
# 或指定端口：./serve.sh 8080
```

然后打开 <http://localhost:8000>。

## 功能

- 打开页面自动从 1 Ma 前（−1000 kyr）播放到"现在"（0 kyr）并循环；
  播放速度 5 kyr/s，一轮约 200 s。
- 左上角 ☰ 打开侧边栏：关于本可视化的简介、数据来源与备注信息（原页脚内容）。
- 双联视图（"一颗地球，两台相机"）：左右两屏共享 kyr 时钟与年相位，
  且各自带切换按钮（左：Orbit / Solstice drift；右：Precession / NH summer）；
  窄屏时右屏自动堆叠到下方。
- 左屏 Orbit 视图（从北极上空视角看）：
  - 地球逆时针（顺行）公转，椭圆随偏心率实时形变（视觉夸张 ×3，
    HUD 与图表显示真实值）；
  - 近日点顺行（拱线进动，约 112 kyr 周期），地轴逆行（赤道进动，
    约 25.7 kyr 周期）——ϖ 按物理比例分解为拱线 + 赤道两份，
    相对几何严格保持 e·sinϖ 数据（符号约定由 tools/check_orbit_signs.mjs 锁定）；
  - 琥珀色圆点为近日点标记（图例在左屏左下角）；
  - HUD 另显示北半球夏至相对近日点的真近点角（岁差最直观的指标：
    0° = 夏至逢近日点，180° = 逢远日点；与轨道几何严格一致）；
  - 地轴加长显示以便观察；地球尾迹存历史真近点角、每帧重投影到当前椭圆。
- 左屏第二视图 Solstice drift（右上角按钮切换，动静结合的教学面板，
  往下滚动）：一张静态示意图（Canvas 2D，几何设计参考 Berger 1978：
  轨道面画成水平的倾斜圆盘，纵深垂直压缩；几何为真实关系
  λ（自春分点起算黄经）、θ = λ − ϖ、r = a(1−e²)/(1+e·cosθ)，
  仅偏心率夸张）——太阳在椭圆焦点、地球在右侧呈地轴北端指向太阳的
  北半球夏至位形，地轴顶端绕轨道面法向画出岁差圆锥（虚线椭圆）；
  图上标注：公转方向（自北黄极看逆时针，底部弧箭头）、地轴岁差摆动
  方向（逆行，绕法向后退一圈 ≈25.7 kyr，紫色弧箭头）、夏至点沿轨道
  后退漂移的方向（珊瑚色弧箭头 + 半透明"幽灵"地球＝数千年后的夏至点）、
  春分点 γ（First Point of Aries，实心圆点，自太阳引虚线）、近日点黄经 ϖ
  （自 γ 至近日点的琥珀色角弧，近日点另以琥珀色圆点标出）与偏心率 e
  （太阳偏离轨道中心，图中仅画出轨道中心点，定义见图例），左上角为符号图例 +
  底部实时动画——地球锁定在北半球夏至点（地轴始终指向太阳），轨道随
  偏心率形变并拱线进动，琥珀色近日点标记，直观展示气候岁差如何拖动季节
  沿轨道相对近日点移动；
  动画左上角显示夏至相对近日点的真近点角 θ_sol。
- 右屏通过右下角按钮在两个视图间切换：
  - Precession（岁差视图，默认）：地球特写（NASA Blue Marble 真实纹理），
    阳光固定从左前方射入——代表一个固定的
    轨道位置；整颗地球（贴图、地轴、纬度圈为一体）在阳光下做逆行岁差摆动，
    地轴相对阳光在 ±ε 间摇摆，该位置的季节在北半球夏与冬之间缓慢翻转
    （起始时刻恰为"北半球夏至"光照），极昼极夜交替可见；
    地轴倾角 ε 随 kyr 呼吸（obliquity）；相机正对 0° 经线；球面只保留赤道环；
  - NH summer（夏季距离视图）：公转轨道侧面视角——卡通太阳在左、地球
    在右，地球固定在北半球夏至位形（北半球在上、地轴顶端倾向太阳，
    倾角摆动在真实值附近夸张 ×6 以便观察）；右下角有北极特写小视图——
    地轴（琥珀色实线）相对"当今倾角"参考线（灰色虚线）同步摆动，
    并显示 ε 真实值与相对今日的 Δ；
    随时间推移地球左右滑动，展示夏至日地距离
    r = a(1−e²)/(1+e·cosθ_sol) 因气候岁差（~21 kyr 主振荡）与偏心率
    （~100 kyr 振幅包络）产生的变化——相对全时段均值的偏差经大幅夸张
    （实际仅百分之几量级）；
    场景上叠加 edge-on 三维轨道（轨道面垂直于屏幕、视线沿公转切向）：
    椭圆始终过地球、太阳为焦点，琥珀色近日点标记沿其运行并周期性
    穿过地球（~21 kyr）；地球上方的浮动标签显示 e·sinϖ 及其
    rising/falling 趋势；
    视图底部有一条 ±100 kyr 滚动时序窄条，随播放滚动 65°N 夏至日均日照量
    全序列（W/m²，insolation 包计算的数据文件），并显示当前值及与今日的差值 Δ；
- 暂停时画面完全冻结（公转 / 尾迹 / 太阳脉动停止），仅保留相机交互。
- 三条时间序列（标题附主周期：Eccentricity ~100 kyr / Obliquity ~41 kyr /
  Climatic precession ~21 kyr）随播放同步揭示，
  t = 0 处标注 Present，0 ~ +60 kyr 的未来区域有暗色底纹。
- 进度条随播放同步；拖动即停止自动播放并跳转（可拖入未来 0 ~ +60 kyr）；
  点 ▶ 恢复播放。
- 左屏 3D 视图可拖拽旋转、滚轮缩放（OrbitControls）；右屏视角固定。

## 数据

轨道解来源：Laskar, J., et al. (2004), *A&A* 428, 261–285,
"A long-term numerical solution for the insolation quantities of the Earth",
[doi:10.1051/0004-6361:20041335](https://doi.org/10.1051/0004-6361:20041335)（La2004 轨道解）。

Solstice drift 示意图的几何设计参考：Berger, A. (1978), "Long-term variations
of daily insolation and Quaternary climatic changes", *Journal of the Atmospheric
Sciences* 35(12), 2362–2367,
[doi:10.1175/1520-0469(1978)035%3C2362:LTVODI%3E2.0.CO;2](https://doi.org/10.1175/1520-0469(1978)035%3C2362:LTVODI%3E2.0.CO;2)。
（日照量数据本身并非出自该文，而是由 insolation 包基于 La2004 轨道解计算，见下。）

`orb_data/` 下四个两列文本（时间 kyr，数值），范围 −1000 ~ +60 kyr，
步长 0.1 kyr，各 10601 行，均由
[insolation](https://github.com/PaleoIPSL/Insolation) Python 包计算生成
（La2004 轨道参数与 65°N 夏至日日照）：

| 文件 | 内容 | 数值范围 |
| --- | --- | --- |
| `ecc_1000_60_inter100.txt` | 偏心率 e | 0.0024 ~ 0.0578 |
| `obl_1000_60_inter100.txt` | 地轴倾角（rad） | 22.08° ~ 24.46° |
| `pre_1000_60_inter100.txt` | 岁差指数 e·sinϖ | — |
| `insolation_65N_solstice_1000_60_inter100.txt` | 65°N 夏至日均日照（W/m²） | 431.7 ~ 560.4 |

前端加载时由 s = e·sinϖ / e = sinϖ 按连续性展开重建近日点经度 ϖ(t)
（正反向各展开一次，取更平滑者；主周期约 21 kyr），用于轨道方位与岁差分解。

地球纹理：NASA Blue Marble（three.js r160 examples 附带的
earth_atmos_2048.jpg，2048×1024），已本地 vendor。
（lib/textures/ 下仍保留 Natural Earth 卡通纹理与 coastlines.json 备用。）

注意：地球在轨道上的相位与公转速度为视觉示意；轨道视图的偏心率夸张 ×3、
夏季距离视图的日地距离偏差与地轴倾角摆动（×6）亦经夸张以便观察，
HUD 与特写视图的读数始终显示真实数值。

## 自检

```sh
node test/data.test.mjs        # 数据解析 + ϖ 重建质量（还原 e·sinϖ 误差 ~1e-15）
node test/player.test.mjs      # 播放引擎循环 / 回卷 / seek 规则
node test/insolation.test.mjs  # 季节几何（δ、â·ŝ=sinδ 几何关系）与日照量公式
node tools/check_orbit_signs.mjs  # 轨道符号约定：公转CCW / 拱线顺行 / 赤道逆行 / 夏至位置 / 跨屏同步 / 夏季距离
```

`package.json` 仅为让 node 以 ESM 方式运行上述自检脚本，项目本身无任何依赖。

## 结构

```
index.html        页面骨架（import map 引入本地 three.js；左右分屏 + 关于侧边栏）
css/style.css     深色星空主题 + 分屏布局 + 侧边栏
js/data.js        数据加载 / 解析 + ϖ 重建（T_START/T_END/DT 在此定义）
js/insolation.js  季节几何与日照量纯函数（δ、θ_sol、太阳仰角、65°N 夏至日照、岁差份额）
js/scene.js       左屏 Orbit 视图（ECC_GAIN、星空、尾迹重投影、近日点标记）
js/solsticeview.js 左屏 Solstice drift 视图（静态示意图 + 夏至锁定动画 + 尾迹）
js/earthview.js   右屏岁差视图（NASA Blue Marble 纹理、固定阳光、整星岁差摆动、0°经线取景）
js/summerview.js  右屏夏季距离视图（侧视日地、夏至距离夸张滑移、edge-on 轨道叠加、65°N 日照滚动时序）
js/coastlines.js  矢量海岸线叠加（备用；当前真实纹理方案下未加载）
js/charts.js      Canvas 时间序列图（深色仪表盘配色）
js/player.js      播放引擎（SPEED_KYR_PER_SEC 调整速度）
js/main.js        入口：组装各视图 / 图表 / 播放器，持有年相位时钟
lib/              three.js r160 + OrbitControls（本地 vendor，离线可用）
lib/textures/     earth_atmos_2048.jpg（NASA Blue Marble，three.js r160 vendor）；
                  earth_cartoon_4096.png / coastlines.json 备用（tools/ 离线生成）
tools/            make_earth_texture.py：Natural Earth 10m land 栅格化为卡通纹理；
                  make_coastlines.py：10m coastline 量化压缩为 coastlines.json；
                  check_orbit_signs.mjs：轨道符号约定自检
orb_data/         轨道与日照数据（ecc / obl / pre / insolation 四个文本）
start.command     macOS 双击启动（杀旧服务 → 起新服务 → 开浏览器）
serve.sh          命令行启动
serve.py          静态服务器（Cache-Control: no-store，防止浏览器沿用旧文件）
test/             node 自检脚本
```

## 部署

整个目录原样上传到任意静态托管（GitHub Pages / OSS / Nginx）即可，
无后端、无构建。
