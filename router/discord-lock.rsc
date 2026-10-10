# English Quest: Discord lock for your son's devices (RouterOS v7).
#
# Paste this into the router terminal (Winbox > New Terminal), after changing the IP addresses below.
# Every line has its full path, so you can paste it all at once or one line at a time.
# It only ADDS things. Everything has the comment "english-quest" so it is easy to find or remove.
# Nothing is blocked yet: the rules start disabled. The English Quest server turns them on and off
# by running the scripts eq-block and eq-unblock.

# ---------------------------------------------------------------------------
# 1. His devices. Give each one a static DHCP lease first (IP > DHCP Server > Leases >
#    double-click > Make Static), then put the IPs here. Add a line for each device.
# ---------------------------------------------------------------------------
/ip firewall address-list add list=eq-kid address=192.168.1.50 comment="english-quest: son computer"
/ip firewall address-list add list=eq-kid address=192.168.1.51 comment="english-quest: son phone"

# ---------------------------------------------------------------------------
# 1b. Discord's servers. The router looks up these names and keeps their IP addresses up to date
#     by itself (they show up as dynamic entries under each name).
# ---------------------------------------------------------------------------
/ip firewall address-list add list=eq-discord address=discord.com comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=www.discord.com comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=gateway.discord.gg comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=discord.gg comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=discordapp.com comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=cdn.discordapp.com comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=media.discordapp.net comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=discordapp.net comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=discord.media comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=status.discord.com comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=remote-auth-gateway.discord.gg comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=updates.discord.com comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=dl.discordapp.net comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=router.discordapp.net comment="english-quest: discord"
/ip firewall address-list add list=eq-discord address=discord.co comment="english-quest: discord"

# ---------------------------------------------------------------------------
# 2. Firewall rules, added at the top of the forward chain, disabled for now.
#    Each "place-before=0" puts the rule first, so they end up in this order:
#      0) reject everything between his devices and Discord's servers (the main rule; it also cuts
#         connections that are already open)
#      a) reject TLS connections to any *discord* name   (extra, for Discord servers not in the list)
#      b) reject QUIC (UDP 443), so his browser uses normal TLS that rule (a) can see
#      c+d) keep his connections out of FastTrack while locked, so rule (a) sees every connection
# ---------------------------------------------------------------------------
/ip firewall filter add chain=forward action=accept connection-state=established,related dst-address-list=eq-kid disabled=yes comment="english-quest: no fasttrack (in)" place-before=0
/ip firewall filter add chain=forward action=accept connection-state=established,related src-address-list=eq-kid disabled=yes comment="english-quest: no fasttrack (out)" place-before=0
/ip firewall filter add chain=forward action=reject reject-with=icmp-port-unreachable protocol=udp dst-port=443 src-address-list=eq-kid disabled=yes comment="english-quest: block QUIC" place-before=0
/ip firewall filter add chain=forward action=reject reject-with=tcp-reset protocol=tcp tls-host=*discord* src-address-list=eq-kid disabled=yes comment="english-quest: block Discord" place-before=0
/ip firewall filter add chain=forward action=reject reject-with=icmp-network-unreachable src-address-list=eq-kid dst-address-list=eq-discord disabled=yes comment="english-quest: block Discord servers" place-before=0

# ---------------------------------------------------------------------------
# 3. The two scripts the server runs.
#    eq-block also cuts his open connections once, when the lock starts, so an open Discord
#    session is dropped too. Running it again while locked does nothing more.
# ---------------------------------------------------------------------------
/system script add name=eq-block policy=read,write,test comment="english-quest" source={
  :local wasOpen ([:len [/ip firewall filter find where comment~"^english-quest" disabled=yes]] > 0)
  /ip firewall filter enable [find where comment~"^english-quest"]
  :if ($wasOpen) do={
    :foreach entry in=[/ip firewall address-list find where list="eq-kid"] do={
      :local ip [/ip firewall address-list get $entry address]
      /ip firewall connection remove [find where src-address~("^" . $ip . ":")]
    }
    :log info "english-quest: Discord locked"
  }
}
# eq-wake wakes the PC with the graphics card (Wake-on-LAN) so it can make pictures at night.
# "bridge" is the usual name of the LAN in MikroTik's default setup; check yours with: /interface bridge print
/system script add name=eq-wake policy=read,write,test comment="english-quest" source={
  /tool wol mac=E8:9C:25:0E:5B:90 interface=bridge
  :log info "english-quest: woke the art PC"
}
/system script add name=eq-unblock policy=read,write,test comment="english-quest" source={
  :local wasLocked ([:len [/ip firewall filter find where comment~"^english-quest" disabled=no]] > 0)
  /ip firewall filter disable [find where comment~"^english-quest"]
  :if ($wasLocked) do={ :log info "english-quest: Discord unlocked" }
}

# ---------------------------------------------------------------------------
# 4. A router user for the server, allowed only to log in with SSH and run these scripts.
#    After this, add the server's public key (see docs/DISCORD-LOCK.md, step 3).
# ---------------------------------------------------------------------------
/user group add name=eq-lock policy=ssh,read,write,test comment="english-quest"
#    Change the password to any long random text. The server never uses it (it uses an SSH key).
/user add name=eq-lock group=eq-lock password="CHANGE-ME-to-a-long-random-password" comment="english-quest: English Quest server"
