[English](./README.en.md)

在[原仓库](https://github.com/std-microblock/CeleMod)的基础上针对 macOS 端做了修复，改用了新的 UI ，也改用了新的后端方式(Tauri v2)，几乎全程 Claude Code+DeepSeek ，UI 修复大多为人工来改。目前可用，但仍有一些下列已知的问题，没意外的话应该**不会修**了。

- 每次打开都会卡顿一段时间
- 主页功能
  - Profile 不记录启动时间
  - 语言默认是英文，`&&` 是中文，下次启动后仍然会自动切换会英文，所以每次启动都要手动改中文。
- Everest 功能，**建议直接使用 Olympus 来操作**。因为这个页面样式没有修复，点击安装不会实时提供安装进度情况，实际上到最后仍然会安装成功的。
- 管理功能
  - Mod 列表删除按钮没有交互反馈
  - Mod 排序按钮没有交互反馈

下载： [Github](https://github.com/2nthony/CeleMod/releases/latest) · [夸克(DT5A)](https://pan.quark.cn/s/4b0236b69dd9)

打不开可以尝试使用终端app输入以下内容并回车。

```sh
xattr -rd com.apple.quarantine /Applications/CeleMod.app
```

<details>
<summary>界面展示</summary>

<img width="864" height="705" alt="Image" src="https://github.com/user-attachments/assets/07bd1d8d-3668-4743-9efc-2481a2a5ae41" />

<img width="864" height="705" alt="Image" src="https://github.com/user-attachments/assets/b6caa99d-56a1-41ef-96e9-3a92634bc43b" />

<img width="864" height="705" alt="Image" src="https://github.com/user-attachments/assets/3a1a8a63-ffc3-4fcd-bce0-4e68f1e5006b" />

<img width="864" height="705" alt="Image" src="https://github.com/user-attachments/assets/102c679c-b475-42db-8b00-626510b5f763" />

<img width="864" height="705" alt="Image" src="https://github.com/user-attachments/assets/8d3f3fee-d8c9-4124-b80b-7f347935baba" />

</details>

---

<div align=center>
<img src="public/Celemod.png" />

# CeleMod

[Github](https://github.com/MicroCBer/CeleMod/releases/latest) · [蓝奏云 (密码·ok)](https://microblock.lanzouo.com/b0apezvij)

An alternative mod manager for Celeste  
 一个 ⌈ 更好用、更强大 ⌋ 的蔚蓝 Mod 管理器

</div>

### 好用

✅ 常用 Mod 列表，一键安装  
✅ 国内超快下载（多线程下载，@WEGFan 镜像）  
✅ 轻量级，启动占用仅 18M  
✅ 一键解析，补全依赖  
✅ 一键升级 Mod  
✅ 按类别搜索，多种排序方式  
✅ 国服联机 Celeste.Miao.Net 快速配置  
✅ Everest 镜像一键安装

### 强大

✅ 多个 Mod 配置一键切换  
✅ 树状 Mod 管理，依赖一目了然  
✅ 多个 Mod 同时下载，不阻塞  
✅ 软件内 Mod 详情预览  
✅ 亚克力 UI

### 页面展示

![image](https://github.com/MicroCBer/CeleMod/assets/66859419/a906d8bb-16dc-4018-b370-9a13cec5ade1)
![image](https://github.com/MicroCBer/CeleMod/assets/66859419/a3592323-c9ea-4ded-9b7c-bf8e23c8f31d)
![6e14b711c66dd7b36fcb76f71470c272](https://github.com/MicroCBer/CeleMod/assets/66859419/1ee695a5-59a0-4326-8f54-cad2165bba74)
![9265bfd9eba65e2d05512510a7b15575](https://github.com/MicroCBer/CeleMod/assets/66859419/8c63b169-4b4b-4fc4-998e-1aae48b4275d)
![a80ca1bb96919629ee69fc237048bdd5](https://github.com/MicroCBer/CeleMod/assets/66859419/ff77be2f-3599-4831-9c38-3703979066b2)
![f5125abf1462349308bf51ad16e42601](https://github.com/MicroCBer/CeleMod/assets/66859419/40705319-3896-4b17-bb68-51f70560df19)
![c7501d330b8620839e0f6a77c5b549c3](https://github.com/MicroCBer/CeleMod/assets/66859419/72ba4cb6-e60d-459a-a7f7-f59521dae63b)

### Credits

[@WEGFan](https://github.com/WEGFan) 提供镜像和社区 API、蔚蓝实现等相关知识
