# 算法迷宫探险课程设计项目

本项目实现“迷宫设计任务”，并内置高质量 AI 玩家用于迷宫调试和交叉测试预检。

## 技术栈

- 后端：Node.js + Express + JavaScript 算法模块
- 前端：Vue 3 + Vite
- 数据规范：兼容 `maze_15_15.json` 与 `input说明.txt`

## 目录结构

```text
maze-adventure/
  server/   后端 API 与算法
  client/   Vue 前端界面
```

## 启动方式

更完整的环境配置、端口说明、Windows 常见问题和部署提示见 [`运行配置说明.md`](运行配置说明.md)。

先安装依赖：

```bash
cd maze-adventure
npm run install:all
```

分别启动后端和前端：

```bash
npm run server
npm run client
```

访问：

```text
http://127.0.0.1:5173
```

后端 API：

```text
http://127.0.0.1:3001
```

## 已实现功能

1. 四种迷宫生成：DFS 回溯、Prim 贪心/最小生成树、分治、分支限界/BFS 式扩展，并支持可复现随机种子。
2. 四算法对比：在同一尺寸/种子下对比时间复杂度、空间复杂度与挑战性指标（`/api/maze/compare`）。
3. 标准 JSON 导入导出，支持 `maze`、`B`、`PlayerSkills`、`minRouds`、`CoinConsumption`。
4. 迷宫校验：矩阵形状、起终点、连通性、唯一通路（完美迷宫）。
5. 动态规划资源路径：输出最大资源值、最优资源路径（不含起终点）和逐格可视化展开路径。
6. BOSS 分支限界：输出最少回合数、最优技能序列，并校验"至少一个无冷却技能"。
7. BOSS 实战推演：失败→金币复活→金币耗尽且失败即 GAME OVER 的完整状态机（`/api/boss/battle`）。
8. 贪心 3×3 实时拾取：独立的单步决策与多局部用例评测，给出每步平均拾取价值及多用例均值。
9. 多策略 AI 玩家：贪心拾取 / DP 最优 / 竞速直达三种策略，输出过程、剩余资源、步数及比值。
10. 交叉测试矩阵：多个"最佳迷宫" × 多个 AI 策略，生成迷宫与 AI 双向评分（`/api/cross-test`）。
11. 吃豆人风格前端：输入/输出窗口、生成过程动画、DP 路径与 AI 探险可视化、迷宫清晰边界。
12. BOSS 冷却继承：同一组 `B[]` 内连续挑战多个 BOSS 时，技能冷却在 BOSS 之间继承（不重置），符合课程 Q&A 要求；技能统一命名，不区分普通/大招。
13. 提交前合法性自检：格式 / 起终点 / 连通性 / 唯一通路 / 15×15 尺寸 / 资源与陷阱 / BOSS 参数（含"至少一个无冷却技能"）一次性检查（`/api/maze/legality`，前端"合法性自检"按钮）。
14. 一键导出验收提交文件：前端"导出最终版"按钮在合法性自检通过后生成 `best_maze_design_组长名.json`。
14.1 资源收集路径测试（`/api/resource/collect-test`，前端"资源收集测试"按钮）：**出发点可自由选择迷宫内任意可通行格，不必从起点 S 出发**，目标是采集资源总价值最大；**起点 S 不设奖励，且采集路径不经过起点 S**（S 从采集图中整体排除）；收集完即可停止，不要求走到终点，也不绕价值为 0 的死胡同走廊（路径首尾都落在金币上）。返回最优起点 `start`、路径长度 `pathLength`、最大资源 `maxResource`；金币数 ≤12 时用独立暴力穷举法（枚举金币子集求最小连通子树价值，同样绕开 S）交叉验证是否已最大化（`isMaximal`），超过则说明改用"最大权连通子树" DP 的精确解性质。注意 AI 玩家的 `optimal` 策略仍从 S 出发（`/api/resource/optimal-path`，`solveResourcePath`），与自由起点的资源收集测试是两套用途。
14.2 本地导入 JSON 文件（前端"导入文件"按钮）：含 `maze` 字段整体替换当前迷宫；只含 `B`/`PlayerSkills` 等字段（例如老师发的 boss_case 文件）则合并进当前迷宫，不覆盖迷宫矩阵。
15. 现场验收 CLI 脚本（见 `server/scripts/`）：批量运行 BOSS 测试用例并输出技能序列、批量做提交前合法性检查、AI 玩家现场键盘输入 BOSS 血量（`-1` 结束）后完整跑通迷宫。

完整的字符约定、JSON 结构与全部 API 端点见 [`input说明.txt`](input说明.txt)。

## 现场验收 CLI 脚本

```bash
# BOSS 战验收：批量运行 boss_case_*.json，打印并导出每个用例每场 BOSS 的技能序列
node server/scripts/runBossCases.js <case.json 或目录> [...更多路径] [--out=结果目录]

# 提交前合法性自检：best_maze_design_组长名.json 是否满足验收要求
node server/scripts/checkSubmission.js <best_maze_design_xxx.json> [...更多文件]

# AI 玩家现场验收：迷宫数据不含 BOSS 血量，运行到 BOSS 位置时按提示逐个输入血量，
# 输入 -1 结束该迷宫的 BOSS 输入，随后自动完成整场探险并输出验收指标
node server/scripts/runAiCli.js <maze.json> [--strategy=greedy|optimal|speedrun]
```

## 输入字符说明

| 字符 | 含义 |
| --- | --- |
| `#` | 墙壁，不可通行 |
| 空格 | 普通通路 |
| `S` | 起点 |
| `E` | 终点 |
| `G` | 金币，价值 50 |
| `T` | 陷阱，价值 -30 |
| `B` | 守卫终点的 BOSS |

除 `#` 外，其余字符均视为可通行格子。
