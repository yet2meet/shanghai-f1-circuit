# 授权素材（可选）

把授权的车队标志放在这个文件夹里，并在 `manifest.json` 中登记，维修楼门头名称牌会自动在队名左侧显示标志。

```json
{
  "teams": {
    "mclaren": "teams/mclaren.png",
    "mercedes": "teams/mercedes.png"
  }
}
```

可用的车队 id：mclaren、mercedes、redbull、ferrari、williams、racingbulls、astonmartin、haas、audi、alpine、cadillac。
建议使用透明背景的 PNG，高度 256 像素左右。没有登记的车队继续显示文字队名。
