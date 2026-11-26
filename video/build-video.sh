#!/bin/bash
# Assemble HeadsUp Market demo video (140s, <=3 min) from screenshots + TTS narration.
set -e
cd ~/workspace/even-realities/video
D=../docs
ffmpeg -y \
  -loop 1 -t 16 -i title.png \
  -loop 1 -t 26 -i $D/sim-btc.png \
  -loop 1 -t 13 -i $D/sim-eth.png \
  -loop 1 -t 13 -i $D/sim-sol.png \
  -loop 1 -t 13 -i $D/sim-sol-detail.png \
  -loop 1 -t 13 -i $D/sim-btc-detail.png \
  -loop 1 -t 26 -i $D/sim-demo-data.png \
  -loop 1 -t 20 -i outro.png \
  -i narration/seg1-intro.mp3 \
  -i narration/seg2-btc.mp3 \
  -i narration/seg3-switch.mp3 \
  -i narration/seg4-detail.mp3 \
  -i narration/seg5-demo.mp3 \
  -i narration/seg6-outro.mp3 \
  -filter_complex "\
[0:v]scale=1152:576:force_original_aspect_ratio=disable,fps=30,format=yuv420p[v0];\
[1:v]scale=1152:576:force_original_aspect_ratio=disable,fps=30,format=yuv420p[v1];\
[2:v]scale=1152:576:force_original_aspect_ratio=disable,fps=30,format=yuv420p[v2];\
[3:v]scale=1152:576:force_original_aspect_ratio=disable,fps=30,format=yuv420p[v3];\
[4:v]scale=1152:576:force_original_aspect_ratio=disable,fps=30,format=yuv420p[v4];\
[5:v]scale=1152:576:force_original_aspect_ratio=disable,fps=30,format=yuv420p[v5];\
[6:v]scale=1152:576:force_original_aspect_ratio=disable,fps=30,format=yuv420p[v6];\
[7:v]scale=1152:576:force_original_aspect_ratio=disable,fps=30,format=yuv420p[v7];\
[v0][v1][v2][v3][v4][v5][v6][v7]concat=n=8:v=1:a=0[vout];\
[8:a]adelay=500|500[a0];\
[9:a]adelay=16500|16500[a1];\
[10:a]adelay=42500|42500[a2];\
[11:a]adelay=68500|68500[a3];\
[12:a]adelay=94500|94500[a4];\
[13:a]adelay=120500|120500[a5];\
[a0][a1][a2][a3][a4][a5]amix=inputs=6:duration=longest:normalize=0,apad[aout]" \
  -map "[vout]" -map "[aout]" -t 140 \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 128k -ar 44100 \
  headsup-market-demo.mp4
ffprobe -v error -show_entries format=duration,size -of default=noprint_wrappers=1 headsup-market-demo.mp4
