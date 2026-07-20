# Milankovitch Cycles · 米兰科维奇周期

一个米兰科维奇周期的 3D 可视化演示，面向刚接触天文周期的学生：
深色星空主题的双联 Three.js 场景——左侧为地球轨道全景，右侧可在
"岁差视图"（卡通地球整星随岁差摆动）与"夏季距离视图"（夏至日地距离
+ 65°N 日照滚动时序）之间切换，展示
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
- 双联视图（"一颗地球，两台相机"）：左右两屏共享 kyr 时钟与年相位；
  窄屏时右屏自动堆叠到下方。
- 左屏轨道动画（从北极上空视角看）：
  - 地球逆时针（顺行）公转，椭圆随偏心率实时形变（视觉夸张 ×3，
    HUD 与图表显示真实值）；
  - 近日点顺行（拱线进动，约 112 kyr 周期），地轴逆行（赤道进动，
    约 25.7 kyr 周期）——ϖ 按物理比例分解为拱线 + 赤道两份，
    相对几何严格保持 e·sinϖ 数据（符号约定由 tools/check_orbit_signs.mjs 锁定）；
  - 琥珀色圆点为近日点标记，珊瑚色圆点为北半球夏至点——它随气候岁差
    沿椭圆缓慢爬行（图例在左屏右上角）；
  - HUD 另显示北半球夏至相对近日点的真近点角（岁差最直观的指标：
    0° = 夏至逢近日点，180° = 逢远日点；与轨道几何严格一致）；
  - 地轴加长显示以便观察；地球尾迹存历史真近点角、每帧重投影到当前椭圆。
- 右屏通过右下角按钮在两个视图间切换：
  - Precession（岁差视图，默认）：卡通地球特写（离线生成的平面卡通纹理，
    海陆分色 + 海岸线 + 高纬冰盖），阳光固定从左前方射入——代表一个固定的
    轨道位置；整颗地球（贴图、地轴、纬度圈为一体）在阳光下做逆行岁差摆动，
    地轴相对阳光在 ±ε 间摇摆，该位置的季节在北半球夏与冬之间缓慢翻转
    （起始时刻恰为"北半球夏至"光照），极昼极夜交替可见；
    地轴倾角 ε 随 kyr 呼吸（obliquity）；相机正对 0° 经线；球面只保留赤道环；
  - NH summer（夏季距离视图）：公转轨道侧面视角——卡通太阳在左、卡通地球
    在右，地球固定在北半球夏至位形（北半球在上、地轴顶端倾向太阳，
    倾角 = 当年 ε）；随时间推移地球左右滑动，展示夏至日地距离
    r = a(1−e²)/(1+e·cosθ_sol) 因气候岁差（~21 kyr 主振荡）与偏心率
    （~100 kyr 振幅包络）产生的变化——相对全时段均值的偏差经大幅夸张
    （实际仅百分之几量级）；
    视图底部有一条 ±100 kyr 滚动时序窄条，随播放滚动 65°N 夏至日均日照量
    全序列（W/m²，由 e、ε、ϖ 纯公式计算），并显示当前值及与今日的差值 Δ；
- 暂停时画面完全冻结（公转 / 尾迹 / 太阳脉动停止），仅保留相机交互。
- 三条时间序列（标题附主周期：Eccentricity ~100 kyr / Obliquity ~41 kyr /
  Climatic precession ~21 kyr）随播放同步揭示，
  t = 0 处标注 Present，0 ~ +60 kyr 的未来区域有暗色底纹。
- 进度条随播放同步；拖动即停止自动播放并跳转（可拖入未来 0 ~ +60 kyr）；
  点 ▶ 恢复播放。
- 左屏 3D 视图可拖拽旋转、滚轮缩放（OrbitControls）；右屏视角固定。

## 数据

数据来源：Laskar, J., et al. (2004), *A&A* 428, 261–285,
"A long-term numerical solution for the insolation quantities of the Earth",
[doi:10.1051/0004-6361:20041335](https://doi.org/10.1051/0004-6361:20041335)（La2004 轨道解）。

`orb_data/` 下三个两列文本（时间 kyr，数值），范围 −1000 ~ +60 kyr，
步长 0.1 kyr，各 10601 行：

| 文件 | 内容 | 数值范围 |
| --- | --- | --- |
| `ecc_1000_60_inter100.txt` | 偏心率 e | 0.0024 ~ 0.0578 |
| `obl_1000_60_inter100.txt` | 地轴倾角（rad） | 22.08° ~ 24.46° |
| `pre_1000_60_inter100.txt` | 岁差指数 e·sinϖ | — |

前端加载时由 s = e·sinϖ / e = sinϖ 按连续性展开重建近日点经度 ϖ(t)
（正反向各展开一次，取更平滑者；主周期约 21 kyr），用于轨道方位与岁差分解。

注意：地球在轨道上的相位与公转速度为视觉示意；轨道视图的偏心率夸张 ×3、
夏季距离视图的日地距离偏差亦经大幅夸张以便观察，HUD 与图表始终显示真实数值。

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
js/scene.js       左屏 Three.js 轨道场景（ECC_GAIN、星空、尾迹重投影、夏至点标记）
js/earthview.js   右屏岁差视图（卡通纹理、固定阳光、整星岁差摆动、0°经线取景）
js/summerview.js  右屏夏季距离视图（侧视日地、夏至距离夸张滑移、65°N 日照滚动时序）
js/charts.js      Canvas 时间序列图（深色仪表盘配色）
js/player.js      播放引擎（SPEED_KYR_PER_SEC 调整速度）
js/main.js        入口：组装各视图 / 图表 / 播放器，持有年相位时钟
lib/              three.js r160 + OrbitControls（本地 vendor，离线可用）
lib/textures/     卡通地球纹理（由 tools/make_earth_texture.py 离线生成）
tools/            make_earth_texture.py：用 three.js 高光 mask 重绘平面卡通纹理；
                  check_orbit_signs.mjs：轨道符号约定自检
orb_data/         轨道数据（ecc / obl / pre 三个文本）
start.command     macOS 双击启动（杀旧服务 → 起新服务 → 开浏览器）
serve.sh          命令行启动
serve.py          静态服务器（Cache-Control: no-store，防止浏览器沿用旧文件）
test/             node 自检脚本
```

## 部署

整个目录原样上传到任意静态托管（GitHub Pages / OSS / Nginx）即可，
无后端、无构建。
