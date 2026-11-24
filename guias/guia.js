// Monta os links das lojas com os códigos de afiliado (os mesmos do app).
(function(){
  var cod={amazon:'',shopee:'',ml:'aguiardaniel16',mlTool:'34020195'};
  var busca={amazon:function(q){return 'https://www.amazon.com.br/s?k='+encodeURIComponent(q)+(cod.amazon?'&tag='+encodeURIComponent(cod.amazon):'')},
    ml:function(q){var u='https://lista.mercadolivre.com.br/'+encodeURIComponent(q.trim().replace(/\s+/g,'-'));if(cod.ml){u+='?matt_word='+encodeURIComponent(cod.ml)+(cod.mlTool?'&matt_tool='+encodeURIComponent(cod.mlTool):'')}return u},
    shopee:function(q){var u='https://shopee.com.br/search?keyword='+encodeURIComponent(q);if(cod.shopee){var s='an_'+cod.shopee;u+='&mmp_pid='+s+'&utm_source='+s+'&utm_medium=affiliates&utm_content=presentecerto-guia'}return u}};
  function aplicar(){document.querySelectorAll('[data-loja]').forEach(function(a){var f=busca[a.getAttribute('data-loja')];if(f)a.href=f(a.getAttribute('data-q'))})}
  aplicar();
  try{fetch('/api/servicos?f=afiliados').then(function(r){return r.json()}).then(function(j){if(!j)return;['amazon','shopee','ml','mlTool'].forEach(function(k){if(j[k]!==undefined&&j[k]!=='')cod[k]=j[k]});aplicar()}).catch(function(){})}catch(e){}
})();